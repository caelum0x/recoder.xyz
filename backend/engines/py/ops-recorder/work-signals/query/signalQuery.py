"""Query + aggregation over recorded WorkSignals.

This module is the read-side of the Work Signals capability. Where the
detectors *produce* signals and the store *persists* them, this module
*interrogates* the stored set: filter by source / item_type / priority /
resolution / detection-time window, and roll the (filtered) set up into a
compact aggregation the backend and agents can reason over.

Design notes
------------
* **Pure functions over a materialised list.** Both helpers operate on a
  plain ``list[WorkSignal]`` (what ``store.get_all()`` already returns), so
  they work identically across the in-memory and Postgres backends without
  adding a method to the storage contract or writing backend-specific SQL.
  The store already loads the full set for ``GET /work-signals``; scoping and
  aggregating that set in-process keeps the read path uniform and the storage
  Protocol stable.
* **Timezone-safe.** ``detected_at`` may be stored tz-aware (the ingest path
  sets UTC) or, defensively, naive. Every comparison coerces both sides to
  aware-UTC so a naive/aware mix never raises ``TypeError`` mid-query.
* **Degrade-safe filters.** An unset filter field is simply not applied; an
  empty result is a valid, truthful answer (not an error).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel

from models.workSignal import WorkSignal
from storage.workSignalRepository import sort_signals


# ---------------------------------------------------------------------------
# Filter contract
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SignalFilters:
    """A conjunctive (AND) set of optional filters over recorded signals.

    Every field is optional; an unset field is not applied. Fields are matched
    against the signal's *normalised* values (``source``/``item_type`` compare
    against the enum value string, e.g. ``"github"`` / ``"pull_request"``).
    """

    source: Optional[str] = None
    item_type: Optional[str] = None
    priority: Optional[str] = None
    resolved: Optional[bool] = None
    since: Optional[datetime] = None  # detected_at >= since (inclusive)
    until: Optional[datetime] = None  # detected_at <= until (inclusive)
    limit: Optional[int] = None


def _as_utc(value: datetime) -> datetime:
    """Coerce a datetime to aware-UTC so naive/aware mixes never raise."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _matches(signal: WorkSignal, filters: SignalFilters) -> bool:
    """Return True when a signal satisfies every set filter field."""
    if filters.source is not None and signal.source.value != filters.source:
        return False
    if filters.item_type is not None and signal.item_type.value != filters.item_type:
        return False
    if filters.priority is not None and signal.priority != filters.priority:
        return False
    if filters.resolved is not None and signal.resolved != filters.resolved:
        return False
    if filters.since is not None and _as_utc(signal.detected_at) < _as_utc(filters.since):
        return False
    if filters.until is not None and _as_utc(signal.detected_at) > _as_utc(filters.until):
        return False
    return True


def filter_signals(
    signals: list[WorkSignal],
    filters: SignalFilters,
) -> list[WorkSignal]:
    """Return the subset of ``signals`` matching ``filters``, canonically sorted.

    The result is sorted by the SAME (priority, detected_at) ordering every
    backend uses, then truncated to ``filters.limit`` when a non-negative limit
    is given. A ``limit`` of 0 yields an empty list; a negative or unset limit
    applies no cap.
    """
    matched = [signal for signal in signals if _matches(signal, filters)]
    ordered = sort_signals(matched)
    if filters.limit is not None and filters.limit >= 0:
        return ordered[: filters.limit]
    return ordered


# ---------------------------------------------------------------------------
# Aggregation contract
# ---------------------------------------------------------------------------


class SignalAggregation(BaseModel):
    """A compact roll-up of a (possibly filtered) set of signals.

    All bucket maps only include keys that actually occur, so an empty set
    yields empty maps and ``None`` timestamps rather than a wall of zeros.
    """

    total: int
    by_source: dict[str, int]
    by_item_type: dict[str, int]
    by_priority: dict[str, int]
    by_status: dict[str, int]  # {"open": n, "resolved": n}
    oldest_detected_at: Optional[datetime] = None
    newest_detected_at: Optional[datetime] = None


def aggregate_signals(signals: list[WorkSignal]) -> SignalAggregation:
    """Roll a list of signals up into counts + a detection-time window.

    Buckets: ``by_source`` (github/linear/…), ``by_item_type``
    (pull_request/issue), ``by_priority`` (high/medium/low), and ``by_status``
    (open vs resolved). ``oldest_/newest_detected_at`` bound the detection
    window (``None`` when the set is empty).
    """
    by_source: Counter[str] = Counter()
    by_item_type: Counter[str] = Counter()
    by_priority: Counter[str] = Counter()
    by_status: Counter[str] = Counter()

    oldest: Optional[datetime] = None
    newest: Optional[datetime] = None

    for signal in signals:
        by_source[signal.source.value] += 1
        by_item_type[signal.item_type.value] += 1
        by_priority[signal.priority] += 1
        by_status["resolved" if signal.resolved else "open"] += 1

        detected = _as_utc(signal.detected_at)
        if oldest is None or detected < oldest:
            oldest = detected
        if newest is None or detected > newest:
            newest = detected

    return SignalAggregation(
        total=len(signals),
        by_source=dict(by_source),
        by_item_type=dict(by_item_type),
        by_priority=dict(by_priority),
        by_status=dict(by_status),
        oldest_detected_at=oldest,
        newest_detected_at=newest,
    )
