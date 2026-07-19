"""Unit tests for the pure memory-insight aggregation core.

These exercise `memory_insights_core` in isolation — no FastAPI, no `mem0`, no
vector store — so they run without the sidecar / Qdrant / an LLM key. The router
(`routers/insights.py`) is a thin shell that feeds live-store payloads into these
functions; testing the shaping here keeps the live-sidecar path a small surface.
"""

from datetime import datetime, timezone

from memory_insights_core import (
    build_graph,
    build_stats,
    matches_scope,
    parse_timestamp,
    to_aware,
    within_window,
)


def _payload(**kwargs):
    return dict(kwargs)


def test_parse_timestamp_tolerates_z_and_bad_input():
    assert parse_timestamp("2026-01-01T00:00:00Z").year == 2026
    assert parse_timestamp("not-a-date") is None
    assert parse_timestamp(None) is None


def test_to_aware_coerces_naive_to_utc():
    naive = datetime(2026, 1, 1, 12, 0, 0)
    assert to_aware(naive).tzinfo is timezone.utc
    assert to_aware(None) is None


def test_within_window_bounds_and_unknown_timestamp():
    after = to_aware(parse_timestamp("2026-01-01T00:00:00Z"))
    before = to_aware(parse_timestamp("2026-02-01T00:00:00Z"))
    assert within_window("2026-01-15T00:00:00Z", after, before) is True
    assert within_window("2025-12-31T00:00:00Z", after, before) is False
    assert within_window("2026-03-01T00:00:00Z", after, before) is False
    # no bounds -> always in window
    assert within_window(None, None, None) is True
    # unknown timestamp excluded once a lower bound is set, kept otherwise
    assert within_window(None, after, None) is False
    assert within_window(None, None, before) is True


def test_matches_scope():
    payload = _payload(user_id="u1", agent_id="a1")
    assert matches_scope(payload, None) is True
    assert matches_scope(payload, {"user_id": "u1"}) is True
    assert matches_scope(payload, {"user_id": "u2"}) is False
    assert matches_scope(payload, {"user_id": "u1", "run_id": "r1"}) is False


def test_build_graph_co_occurrence_edges_and_weights():
    payloads = [
        _payload(user_id="u1", agent_id="a1"),
        _payload(user_id="u1", agent_id="a1"),  # repeats -> weight 2 on (u1,a1)
        _payload(user_id="u1", agent_id="a2"),
        _payload(agent_id="a2"),  # a2 alone -> node count grows, no new edge
    ]
    graph = build_graph(payloads)
    weights = {
        (edge["source_type"], edge["source_id"], edge["target_type"], edge["target_id"]): edge["weight"]
        for edge in graph["edges"]
    }
    assert weights[("agent", "a1", "user", "u1")] == 2
    assert weights[("agent", "a2", "user", "u1")] == 1
    a2_node = next(node for node in graph["nodes"] if node["id"] == "a2" and node["type"] == "agent")
    assert a2_node["memories"] == 2
    assert graph["truncated"] is False


def test_build_graph_focus_neighborhood():
    payloads = [
        _payload(user_id="u1", agent_id="a1"),
        _payload(user_id="u2", agent_id="a2"),  # unrelated to u1
    ]
    graph = build_graph(payloads, focus="u1", entity_type="user")
    node_ids = {(node["type"], node["id"]) for node in graph["nodes"]}
    assert ("user", "u1") in node_ids
    assert ("agent", "a1") in node_ids
    # the disjoint u2/a2 component is pruned from the neighborhood
    assert ("user", "u2") not in node_ids
    assert ("agent", "a2") not in node_ids


def test_build_graph_scope_filters_before_aggregation():
    payloads = [
        _payload(user_id="u1", agent_id="a1"),
        _payload(user_id="u2", agent_id="a2"),
    ]
    graph = build_graph(payloads, scope={"user_id": "u1"})
    node_ids = {node["id"] for node in graph["nodes"]}
    assert node_ids == {"u1", "a1"}
    assert graph["scope"] == {"user_id": "u1"}


def test_build_graph_truncation_flag():
    # 4 distinct agents all sharing one user -> C(1 user + 4 agents)... only
    # user<->agent pairs (4 edges); cap at 2 -> truncated.
    payloads = [_payload(user_id="u1", agent_id=f"a{i}") for i in range(4)]
    graph = build_graph(payloads, max_edges=2)
    assert graph["edge_count"] == 4
    assert len(graph["edges"]) == 2
    assert graph["truncated"] is True


def test_build_stats_counts_and_span():
    payloads = [
        _payload(user_id="u1", agent_id="a1", created_at="2026-01-01T00:00:00Z"),
        _payload(user_id="u1", agent_id="a2", created_at="2026-03-01T00:00:00Z"),
        _payload(user_id="u2", created_at="2026-02-01T00:00:00Z"),
    ]
    stats = build_stats(payloads, memory_initialized=True, scan_limit=10_000)
    assert stats["total_memories"] == 3
    assert stats["distinct_entities"] == {"user": 2, "agent": 2, "run": 0}
    assert stats["memories_with_entity"] == {"user": 3, "agent": 2, "run": 0}
    assert stats["oldest_created_at"].startswith("2026-01-01")
    assert stats["newest_created_at"].startswith("2026-03-01")
    assert stats["scan_truncated"] is False
    assert stats["memory_initialized"] is True


def test_build_stats_scoped_and_truncation():
    payloads = [
        _payload(user_id="u1", created_at="2026-01-01T00:00:00Z"),
        _payload(user_id="u2", created_at="2026-01-02T00:00:00Z"),
    ]
    stats = build_stats(payloads, memory_initialized=True, scan_limit=2, scope={"user_id": "u1"})
    assert stats["total_memories"] == 1
    assert stats["distinct_entities"]["user"] == 1
    # scanned (2) >= scan_limit (2) -> counts are a floor
    assert stats["scan_truncated"] is True
    assert stats["scope"] == {"user_id": "u1"}
