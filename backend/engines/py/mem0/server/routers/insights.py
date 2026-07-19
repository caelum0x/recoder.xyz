"""Deeper memory-insight endpoints over the SAME real mem0 vector store the core
`add` / `search` / `get_all` use — no new backing store, no fabricated data:

  - POST /insights/recall   Filtered recall by scope (user/agent/run), a time
                            window (created_after / created_before), and metadata
                            equality filters, with an optional semantic `query`.
  - GET  /insights/graph    A relations graph derived from co-occurrence of
                            entities (user/agent/run) within the same stored
                            memory payloads — real edges over real data.
  - GET  /insights/stats    Aggregate counts: totals, per-entity-type breakdown,
                            distinct entities, and the created_at span.

The `/insights` prefix keeps these clear of the `/memories/{memory_id}` param
route. Every endpoint reads the LIVE vector store; when it is unreachable the
call raises a truthful upstream error (502) instead of returning empty/fake
results, matching the rest of the server's degrade posture.
"""

from typing import Any, Optional

from auth import verify_auth
from errors import upstream_error
from fastapi import APIRouter, Depends, HTTPException, Query
from memory_insights_core import (
    MAX_GRAPH_EDGES,
    SCAN_LIMIT,
    EntityType,
    build_graph,
    build_stats,
    parse_timestamp,
    to_aware,
    within_window,
)
from pydantic import BaseModel, Field
from server_state import get_memory_instance, is_initialized

router = APIRouter(prefix="/insights", tags=["insights"])

DEFAULT_RECALL_LIMIT = 50
MAX_RECALL_LIMIT = 1_000


def _iter_payloads(limit: int) -> list[dict[str, Any]]:
    """Read raw stored payloads from the LIVE vector store (bounded by `limit`)."""
    results = get_memory_instance().vector_store.list(top_k=limit)
    rows = results[0] if results and isinstance(results, list) and isinstance(results[0], list) else results or []
    return [getattr(row, "payload", None) or {} for row in rows]


class RecallRequest(BaseModel):
    user_id: Optional[str] = Field(None, description="Scope by user entity.")
    agent_id: Optional[str] = Field(None, description="Scope by agent entity.")
    run_id: Optional[str] = Field(None, description="Scope by run entity.")
    query: Optional[str] = Field(None, description="Optional semantic query (search vs list-all).")
    created_after: Optional[str] = Field(None, description="ISO 8601 lower bound on created_at.")
    created_before: Optional[str] = Field(None, description="ISO 8601 upper bound on created_at.")
    metadata: Optional[dict[str, Any]] = Field(None, description="Extra equality filters merged into filters.")
    limit: int = Field(DEFAULT_RECALL_LIMIT, ge=1, le=MAX_RECALL_LIMIT)


@router.post("/recall", summary="Filtered recall by scope, time window, and metadata")
def filtered_recall(req: RecallRequest, _auth=Depends(verify_auth)):
    """Recall memories scoped by entity + an optional created_at window.

    At least one of user_id/agent_id/run_id is required (the store rejects an
    unscoped list). Entity + metadata filters go to the store; the time window is
    applied over the returned records so it works on ANY vector store regardless
    of native timestamp-filter support.
    """
    entity = {
        key: value
        for key, value in {"user_id": req.user_id, "agent_id": req.agent_id, "run_id": req.run_id}.items()
        if value
    }
    if not entity:
        raise HTTPException(status_code=400, detail="At least one of user_id, agent_id, run_id is required.")

    after = to_aware(parse_timestamp(req.created_after)) if req.created_after else None
    before = to_aware(parse_timestamp(req.created_before)) if req.created_before else None
    if req.created_after and after is None:
        raise HTTPException(status_code=400, detail="created_after must be an ISO 8601 timestamp.")
    if req.created_before and before is None:
        raise HTTPException(status_code=400, detail="created_before must be an ISO 8601 timestamp.")

    filters: dict[str, Any] = dict(entity)
    if req.metadata:
        filters.update(req.metadata)

    try:
        memory = get_memory_instance()
        if req.query and req.query.strip():
            raw = memory.search(query=req.query, filters=filters, top_k=req.limit)
        else:
            raw = memory.get_all(filters=filters, top_k=req.limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise upstream_error()

    results = raw.get("results", []) if isinstance(raw, dict) else (raw or [])
    filtered = [
        record
        for record in results
        if within_window(record.get("created_at") if isinstance(record, dict) else None, after, before)
    ]
    return {
        "results": filtered,
        "count": len(filtered),
        "scanned": len(results),
        "applied_filters": {
            "entity": entity,
            "metadata": req.metadata or {},
            "query": req.query,
            "created_after": req.created_after,
            "created_before": req.created_before,
            "limit": req.limit,
        },
    }


@router.get("/graph", summary="Entity co-occurrence relations graph")
def relations_graph(
    focus: Optional[str] = Query(None, description="Entity id to center the neighborhood on."),
    entity_type: Optional[EntityType] = Query(None, description="Narrow `focus` to a single entity kind."),
    user_id: Optional[str] = Query(None, description="Scope aggregation to this user entity."),
    agent_id: Optional[str] = Query(None, description="Scope aggregation to this agent entity."),
    run_id: Optional[str] = Query(None, description="Scope aggregation to this run entity."),
    limit: int = Query(SCAN_LIMIT, ge=1, le=SCAN_LIMIT, description="Max payloads to scan."),
    _auth=Depends(verify_auth),
):
    """A relations graph (nodes = entities, edges = shared-memory co-occurrence),
    optionally scoped to an entity and/or centered on a `focus` neighborhood."""
    scope = {
        key: value
        for key, value in {"user_id": user_id, "agent_id": agent_id, "run_id": run_id}.items()
        if value
    }
    try:
        payloads = _iter_payloads(limit)
    except Exception:
        raise upstream_error()
    return build_graph(
        payloads,
        scope=scope or None,
        focus=focus,
        entity_type=entity_type,
        max_edges=MAX_GRAPH_EDGES,
    )


@router.get("/stats", summary="Aggregate memory statistics")
def memory_stats(
    user_id: Optional[str] = Query(None, description="Scope stats to this user entity."),
    agent_id: Optional[str] = Query(None, description="Scope stats to this agent entity."),
    run_id: Optional[str] = Query(None, description="Scope stats to this run entity."),
    _auth=Depends(verify_auth),
):
    """Truthful aggregate stats over stored memories (optionally entity-scoped)."""
    scope = {
        key: value
        for key, value in {"user_id": user_id, "agent_id": agent_id, "run_id": run_id}.items()
        if value
    }
    try:
        payloads = _iter_payloads(SCAN_LIMIT)
    except Exception:
        raise upstream_error()
    return build_stats(payloads, memory_initialized=is_initialized(), scan_limit=SCAN_LIMIT, scope=scope or None)
