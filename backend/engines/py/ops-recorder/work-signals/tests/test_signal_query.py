"""Unit tests for the signal query + aggregation read-side (query/signalQuery.py).

These exercise the filter/aggregate helpers directly over constructed
``WorkSignal`` objects — no store, no FastAPI, no credentials. They cover the
conjunctive filter semantics, the timezone-safe detection-window comparisons,
the canonical ordering + limit, and the aggregation roll-up (including the
empty set).
"""

from __future__ import annotations

from datetime import datetime, timezone

from models.workSignal import ItemType, Source, WorkSignal
from query.signalQuery import (
    SignalFilters,
    aggregate_signals,
    filter_signals,
)


def _signal(
    *,
    url: str,
    source: Source = Source.GITHUB,
    item_type: ItemType = ItemType.PULL_REQUEST,
    priority: str = "medium",
    resolved: bool = False,
    detected_at: datetime,
) -> WorkSignal:
    return WorkSignal(
        id=WorkSignal.make_id(source, url),
        source=source,
        item_type=item_type,
        title=f"stuck {url}",
        source_url=url,
        detected_reason="reason",
        priority=priority,
        why_it_matters="matters",
        recommended_next_action="do the thing",
        created_at=detected_at,
        detected_at=detected_at,
        resolved=resolved,
    )


def _sample() -> list[WorkSignal]:
    return [
        _signal(
            url="gh/pr/1",
            source=Source.GITHUB,
            item_type=ItemType.PULL_REQUEST,
            priority="high",
            detected_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
        _signal(
            url="gh/issue/2",
            source=Source.GITHUB,
            item_type=ItemType.ISSUE,
            priority="low",
            resolved=True,
            detected_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        ),
        _signal(
            url="lin/issue/3",
            source=Source.LINEAR,
            item_type=ItemType.ISSUE,
            priority="medium",
            detected_at=datetime(2026, 1, 10, tzinfo=timezone.utc),
        ),
    ]


# ---------------------------------------------------------------------------
# filter_signals
# ---------------------------------------------------------------------------

def test_no_filters_returns_all_sorted_by_priority() -> None:
    out = filter_signals(_sample(), SignalFilters())
    assert [s.source_url for s in out] == ["gh/pr/1", "lin/issue/3", "gh/issue/2"]


def test_filter_by_source() -> None:
    out = filter_signals(_sample(), SignalFilters(source="github"))
    assert {s.source_url for s in out} == {"gh/pr/1", "gh/issue/2"}


def test_filter_by_item_type_and_priority_is_conjunctive() -> None:
    out = filter_signals(
        _sample(), SignalFilters(item_type="issue", priority="medium")
    )
    assert [s.source_url for s in out] == ["lin/issue/3"]


def test_filter_by_resolved() -> None:
    assert [s.source_url for s in filter_signals(_sample(), SignalFilters(resolved=True))] == [
        "gh/issue/2"
    ]
    unresolved = filter_signals(_sample(), SignalFilters(resolved=False))
    assert {s.source_url for s in unresolved} == {"gh/pr/1", "lin/issue/3"}


def test_filter_by_detection_window_inclusive() -> None:
    out = filter_signals(
        _sample(),
        SignalFilters(
            since=datetime(2026, 1, 5, tzinfo=timezone.utc),
            until=datetime(2026, 1, 10, tzinfo=timezone.utc),
        ),
    )
    assert {s.source_url for s in out} == {"gh/issue/2", "lin/issue/3"}


def test_since_filter_tolerates_naive_datetime() -> None:
    # A naive `since` must not raise against tz-aware detected_at.
    out = filter_signals(_sample(), SignalFilters(since=datetime(2026, 1, 6)))
    assert [s.source_url for s in out] == ["lin/issue/3"]


def test_limit_truncates_after_sort() -> None:
    out = filter_signals(_sample(), SignalFilters(limit=1))
    assert [s.source_url for s in out] == ["gh/pr/1"]  # highest priority first


def test_limit_zero_yields_empty() -> None:
    assert filter_signals(_sample(), SignalFilters(limit=0)) == []


# ---------------------------------------------------------------------------
# aggregate_signals
# ---------------------------------------------------------------------------

def test_aggregate_counts_and_window() -> None:
    agg = aggregate_signals(_sample())
    assert agg.total == 3
    assert agg.by_source == {"github": 2, "linear": 1}
    assert agg.by_item_type == {"pull_request": 1, "issue": 2}
    assert agg.by_priority == {"high": 1, "low": 1, "medium": 1}
    assert agg.by_status == {"open": 2, "resolved": 1}
    assert agg.oldest_detected_at == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert agg.newest_detected_at == datetime(2026, 1, 10, tzinfo=timezone.utc)


def test_aggregate_empty_set_is_truthful() -> None:
    agg = aggregate_signals([])
    assert agg.total == 0
    assert agg.by_source == {}
    assert agg.by_status == {}
    assert agg.oldest_detected_at is None
    assert agg.newest_detected_at is None
