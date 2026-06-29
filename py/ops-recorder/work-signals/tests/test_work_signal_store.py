"""Unit tests for the WorkSignal storage layer.

Covers the in-memory backend and the selecting proxy. Postgres is exercised
separately (it needs a live recoder_backend database); these tests run with no
external dependencies beyond pydantic.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from models.workSignal import ItemType, Source, WorkSignal
from storage.inMemoryWorkSignalStore import InMemoryWorkSignalStore
from storage.workSignalRepository import WorkSignalRepository, sort_signals


def _signal(url: str, priority: str = "high", *, detected_offset: int = 0) -> WorkSignal:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return WorkSignal(
        id=WorkSignal.make_id(Source.GITHUB, url),
        source=Source.GITHUB,
        item_type=ItemType.ISSUE,
        title="t",
        source_url=url,
        detected_reason="r",
        priority=priority,
        why_it_matters="w",
        recommended_next_action="a",
        created_at=base,
        detected_at=base + timedelta(minutes=detected_offset),
    )


def test_inmemory_satisfies_protocol() -> None:
    # runtime_checkable Protocol — the structural check must pass.
    assert isinstance(InMemoryWorkSignalStore(), WorkSignalRepository)


def test_save_get_count_roundtrip() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        await store.initialize()
        s = _signal("https://github.com/x/y/issues/1")
        await store.save(s)
        assert await store.count() == 1
        got = await store.get(s.id)
        assert got is not None
        assert got.source_url == "https://github.com/x/y/issues/1"
        assert await store.get("does-not-exist") is None
        await store.close()

    asyncio.run(run())


def test_save_is_idempotent_by_id() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        url = "https://github.com/x/y/issues/7"
        await store.save(_signal(url, priority="low"))
        await store.save(_signal(url, priority="high"))  # same id, overwrite
        assert await store.count() == 1
        got = await store.get(WorkSignal.make_id(Source.GITHUB, url))
        assert got is not None and got.priority == "high"

    asyncio.run(run())


def test_update_resolved() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        s = _signal("https://github.com/x/y/issues/2")
        await store.save(s)
        assert await store.update_resolved(s.id, True) is True
        got = await store.get(s.id)
        assert got is not None and got.resolved is True
        # Missing id returns False, never raises.
        assert await store.update_resolved("nope", True) is False

    asyncio.run(run())


def test_get_all_orders_by_priority_then_detected_at() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        await store.save(_signal("u-low", priority="low", detected_offset=0))
        await store.save(_signal("u-high-late", priority="high", detected_offset=10))
        await store.save(_signal("u-high-early", priority="high", detected_offset=0))
        await store.save(_signal("u-medium", priority="medium", detected_offset=0))
        urls = [s.source_url for s in await store.get_all()]
        assert urls == ["u-high-early", "u-high-late", "u-medium", "u-low"]

    asyncio.run(run())


def test_clear_empties_store() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        await store.save(_signal("u1"))
        await store.save(_signal("u2"))
        await store.clear()
        assert await store.count() == 0
        assert await store.get_all() == []

    asyncio.run(run())


def test_save_many_batch() -> None:
    async def run() -> None:
        store = InMemoryWorkSignalStore()
        await store.save_many([_signal("a"), _signal("b"), _signal("c")])
        assert await store.count() == 3

    asyncio.run(run())


def test_sort_signals_helper_is_stable_for_unknown_priority() -> None:
    weird = _signal("weird", priority="urgent")  # not in PRIORITY_ORDER
    high = _signal("high", priority="high")
    ordered = sort_signals([weird, high])
    # Known priority sorts before the unknown (which maps to rank 99).
    assert [s.source_url for s in ordered] == ["high", "weird"]


def test_proxy_defaults_to_in_memory_and_delegates() -> None:
    # Import here so the module-level `store` proxy is exercised end-to-end.
    from storage.workSignalStore import store

    async def run() -> None:
        await store.clear()
        assert store.backend_name == "InMemoryWorkSignalStore"
        s = _signal("https://github.com/x/y/issues/99")
        await store.save(s)
        assert await store.count() == 1
        await store.clear()

    asyncio.run(run())
