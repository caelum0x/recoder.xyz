"""Unit tests for the direct ingest surface (api/ingest.py).

These exercise the push edge that the Recoder backend uses at the
``/work-signals`` ingress: turning an already-detected stuck-work payload into a
stored-ready ``WorkSignal`` with a handoff prompt, without any GitHub/Linear
credentials. Like the rest of the suite, they need only pydantic.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from api.ingest import WorkSignalIngest, ingest_to_signal
from models.workSignal import ItemType, Source, WorkSignal
from storage.inMemoryWorkSignalStore import InMemoryWorkSignalStore


def _payload(**overrides) -> WorkSignalIngest:
    base = dict(
        source=Source.GITHUB,
        item_type=ItemType.PULL_REQUEST,
        title="Add retry to payment webhook",
        source_url="https://github.com/org/repo/pull/42",
        detected_reason="Failing CI for 3 days",
        priority="high",
    )
    base.update(overrides)
    return WorkSignalIngest(**base)


def test_ingest_to_signal_fills_handoff_and_id() -> None:
    signal = ingest_to_signal(_payload())
    assert isinstance(signal, WorkSignal)
    # Deterministic id matches the sync path's make_id.
    assert signal.id == WorkSignal.make_id(
        Source.GITHUB, "https://github.com/org/repo/pull/42"
    )
    # Handoff prompt is generated up-front so the item is agent-ready.
    assert signal.agent_handoff_prompt
    assert "STUCK ITEM" in signal.agent_handoff_prompt
    # Detected fields carried through verbatim.
    assert signal.detected_reason == "Failing CI for 3 days"
    assert signal.priority == "high"


def test_ingest_defaults_fill_optional_context() -> None:
    signal = ingest_to_signal(_payload())
    # Optional context not supplied -> safe non-empty defaults.
    assert signal.why_it_matters
    assert signal.recommended_next_action
    assert signal.assignee is None
    assert signal.created_at.tzinfo is not None


def test_ingest_unknown_priority_degrades_to_medium() -> None:
    signal = ingest_to_signal(_payload(priority="URGENT"))
    assert signal.priority == "medium"


def test_ingest_respects_supplied_created_at() -> None:
    when = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    signal = ingest_to_signal(_payload(created_at=when))
    assert signal.created_at == when


def test_ingest_roundtrips_through_store_idempotently() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        first = ingest_to_signal(_payload(priority="low"))
        await store.save(first)
        # Same source_url -> same id -> overwrite, not duplicate.
        second = ingest_to_signal(_payload(priority="high"))
        await store.save(second)
        assert await store.count() == 1
        got = await store.get(first.id)
        assert got is not None and got.priority == "high"

    asyncio.run(run())
