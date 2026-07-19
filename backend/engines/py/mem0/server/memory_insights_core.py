"""Pure, dependency-light aggregation logic for the deeper memory-insight
endpoints (`routers/insights.py`).

This module holds ONLY stdlib logic — no FastAPI, no `mem0`, no vector store —
so it is unit-testable in isolation (see `test_memory_insights_core.py`) without
standing up the sidecar / Qdrant / an LLM key. The router feeds it the payload
dicts / memory records it reads from the LIVE vector store; the shaping of
filtered recall, the relations graph, and stats lives here.

Every function operates over REAL stored payloads — it derives relations and
stats from the data the store returns, it never fabricates memories or edges.
"""

from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Literal, Optional

# The full-scan cap for graph/stats aggregation (bounds work + memory).
SCAN_LIMIT = 10_000
# The max edges returned from the relations graph (heaviest-weight first).
MAX_GRAPH_EDGES = 2_000

EntityType = Literal["user", "agent", "run"]
# Entity kind -> the payload field that carries its id.
TYPE_TO_FIELD: dict[EntityType, str] = {"user": "user_id", "agent": "agent_id", "run": "run_id"}


def parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse an ISO 8601 timestamp (tolerating a trailing `Z`). None on any miss."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def to_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce a naive datetime to UTC so tz-aware/naive comparisons never raise."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def within_window(
    created_at_value: Any,
    after: Optional[datetime],
    before: Optional[datetime],
) -> bool:
    """Is a record's `created_at` inside the [after, before] window?

    Both bounds are optional. A record with an UNKNOWN/unparseable timestamp is
    kept only when no `after` bound is set (an explicit lower bound excludes
    records we cannot place in time) — a truthful, conservative filter.
    """
    if after is None and before is None:
        return True
    ts = to_aware(parse_timestamp(created_at_value))
    if ts is None:
        return after is None
    if after is not None and ts < after:
        return False
    if before is not None and ts > before:
        return False
    return True


def matches_scope(payload: dict[str, Any], scope: Optional[dict[str, str]]) -> bool:
    """Does a payload match every entity field in `scope` (snake_case keys)?

    An empty/None scope matches everything (the global/admin view). Used to keep
    graph + stats tenant-scoped so a non-privileged caller only ever aggregates
    its OWN memories (the cross-tenant surface stays closed).
    """
    if not scope:
        return True
    return all(payload.get(key) == value for key, value in scope.items())


def build_graph(
    payloads: list[dict[str, Any]],
    *,
    scope: Optional[dict[str, str]] = None,
    focus: Optional[str] = None,
    entity_type: Optional[EntityType] = None,
    max_edges: int = MAX_GRAPH_EDGES,
) -> dict[str, Any]:
    """Derive an entity co-occurrence graph from stored memory payloads.

    Nodes are entities (user/agent/run) with the count of memories they appear
    in; edges connect two entities that co-occur within the SAME memory payload,
    weighted by how many memories they share. When `focus` is given (optionally
    narrowed to `entity_type`), only that entity's neighborhood is returned.
    Edges are heaviest-weight first and capped at `max_edges` (`truncated` flags
    a cap hit).
    """
    node_counts: dict[tuple[EntityType, str], int] = defaultdict(int)
    edge_weights: dict[tuple[tuple[EntityType, str], tuple[EntityType, str]], int] = defaultdict(int)

    for payload in payloads:
        if not matches_scope(payload, scope):
            continue
        entities: list[tuple[EntityType, str]] = []
        for etype, field in TYPE_TO_FIELD.items():
            value = payload.get(field)
            if value:
                key = (etype, str(value))
                node_counts[key] += 1
                entities.append(key)
        for left, right in combinations(sorted(set(entities)), 2):
            edge_weights[(left, right)] += 1

    if focus:
        focus_types = [entity_type] if entity_type else list(TYPE_TO_FIELD)
        focus_keys = {(etype, focus) for etype in focus_types if (etype, focus) in node_counts}
        kept_edges = {
            pair: weight
            for pair, weight in edge_weights.items()
            if pair[0] in focus_keys or pair[1] in focus_keys
        }
        neighbor_keys: set[tuple[EntityType, str]] = set(focus_keys)
        for left, right in kept_edges:
            neighbor_keys.add(left)
            neighbor_keys.add(right)
        node_counts = {key: count for key, count in node_counts.items() if key in neighbor_keys}
        edge_weights = kept_edges

    total_edges = len(edge_weights)
    edges_sorted = sorted(edge_weights.items(), key=lambda item: item[1], reverse=True)[:max_edges]

    return {
        "nodes": [
            {"id": eid, "type": etype, "memories": count}
            for (etype, eid), count in sorted(node_counts.items(), key=lambda item: (item[0][0], item[0][1]))
        ],
        "edges": [
            {
                "source_type": left[0],
                "source_id": left[1],
                "target_type": right[0],
                "target_id": right[1],
                "weight": weight,
            }
            for (left, right), weight in edges_sorted
        ],
        "node_count": len(node_counts),
        "edge_count": total_edges,
        "truncated": total_edges > max_edges,
        "focus": focus,
        "scope": scope or None,
    }


def build_stats(
    payloads: list[dict[str, Any]],
    *,
    memory_initialized: bool,
    scan_limit: int = SCAN_LIMIT,
    scope: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Aggregate truthful memory stats over stored payloads.

    Reports the total in-scope memory count, distinct entity counts + how many
    memories carry each entity kind, and the created_at span. `scan_truncated`
    flags that the underlying scan hit `scan_limit` (so counts are a floor).
    """
    total = 0
    scanned = 0
    distinct: dict[EntityType, set[str]] = {etype: set() for etype in TYPE_TO_FIELD}
    with_entity: dict[EntityType, int] = {etype: 0 for etype in TYPE_TO_FIELD}
    oldest: Optional[datetime] = None
    newest: Optional[datetime] = None

    for payload in payloads:
        scanned += 1
        if not matches_scope(payload, scope):
            continue
        total += 1
        for etype, field in TYPE_TO_FIELD.items():
            value = payload.get(field)
            if value:
                distinct[etype].add(str(value))
                with_entity[etype] += 1
        ts = to_aware(parse_timestamp(payload.get("created_at")))
        if ts is not None:
            oldest = ts if oldest is None or ts < oldest else oldest
            newest = ts if newest is None or ts > newest else newest

    return {
        "memory_initialized": memory_initialized,
        "total_memories": total,
        "scan_truncated": scanned >= scan_limit,
        "distinct_entities": {etype: len(ids) for etype, ids in distinct.items()},
        "memories_with_entity": with_entity,
        "oldest_created_at": oldest.isoformat() if oldest else None,
        "newest_created_at": newest.isoformat() if newest else None,
        "scope": scope or None,
    }
