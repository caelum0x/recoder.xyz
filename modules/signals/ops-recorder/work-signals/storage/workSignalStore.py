"""WorkSignal store — backend selection and the shared ``store`` instance.

This module is the single import point for the rest of the app:

    from storage.workSignalStore import store

    await store.save(signal)
    all_signals = await store.get_all()
    signal = await store.get("abc123")
    await store.update_resolved("abc123", resolved=True)
    await store.clear()

``store`` is a thin proxy implementing :class:`WorkSignalRepository`. It starts
delegating to the in-memory backend (always available, zero setup) and can be
upgraded to the durable Postgres backend at startup via :func:`init_store`.

Backend selection (in :func:`init_store`):
    * If a Postgres URL is configured (``WORK_SIGNALS_DATABASE_URL`` /
      ``RECODER_BACKEND_DATABASE_URL`` / ``DATABASE_URL``) **and** asyncpg is
      importable, use Postgres. The pool is opened and the schema ensured.
    * Otherwise fall back to the in-memory store and log a warning so the
      operator knows persistence is off.

Failure to bring up Postgres degrades to in-memory rather than crashing the
service — but the failure is logged loudly, never hidden.
"""

from __future__ import annotations

import logging
from typing import Optional

from models.workSignal import WorkSignal
from storage.inMemoryWorkSignalStore import InMemoryWorkSignalStore
from storage.workSignalRepository import WorkSignalRepository

logger = logging.getLogger("work_signals.storage")


class _StoreProxy:
    """Delegates every :class:`WorkSignalRepository` call to the active backend.

    Keeping a stable proxy object means modules can ``from storage.workSignalStore
    import store`` at import time and the backend can still be swapped underneath
    them at startup without re-importing anything.
    """

    def __init__(self, backend: WorkSignalRepository) -> None:
        self._backend = backend

    # -- backend management -------------------------------------------------

    def _set_backend(self, backend: WorkSignalRepository) -> None:
        self._backend = backend

    @property
    def backend(self) -> WorkSignalRepository:
        return self._backend

    @property
    def backend_name(self) -> str:
        return type(self._backend).__name__

    # -- WorkSignalRepository (delegation) ---------------------------------

    async def initialize(self) -> None:
        await self._backend.initialize()

    async def close(self) -> None:
        await self._backend.close()

    async def save(self, signal: WorkSignal) -> None:
        await self._backend.save(signal)

    async def save_many(self, signals: list[WorkSignal]) -> None:
        await self._backend.save_many(signals)

    async def update_resolved(self, signal_id: str, resolved: bool) -> bool:
        return await self._backend.update_resolved(signal_id, resolved)

    async def clear(self) -> None:
        await self._backend.clear()

    async def get(self, signal_id: str) -> Optional[WorkSignal]:
        return await self._backend.get(signal_id)

    async def get_all(self) -> list[WorkSignal]:
        return await self._backend.get_all()

    async def count(self) -> int:
        return await self._backend.count()


# ---------------------------------------------------------------------------
# Shared instance — import this everywhere. Defaults to in-memory so the app is
# usable before init_store() runs (and so tests work without a database).
# ---------------------------------------------------------------------------

store = _StoreProxy(InMemoryWorkSignalStore())


async def init_store() -> WorkSignalRepository:
    """Select and initialize the storage backend. Call once at startup.

    Returns the active backend. Safe to call when no Postgres URL is set — it
    simply initializes the in-memory backend and returns it.
    """
    # Imported lazily so the module still imports cleanly when asyncpg is not
    # installed (in-memory-only environments, e.g. unit tests).
    try:
        from storage.postgresWorkSignalStore import (
            PostgresWorkSignalStore,
            resolve_database_url,
        )
    except ImportError:
        logger.warning(
            "asyncpg is not installed — WorkSignal persistence falls back to "
            "in-memory. Install asyncpg and set WORK_SIGNALS_DATABASE_URL to "
            "enable durable storage."
        )
        await store.backend.initialize()
        return store.backend

    database_url = resolve_database_url()
    if not database_url:
        logger.warning(
            "No WorkSignal database URL configured (WORK_SIGNALS_DATABASE_URL / "
            "RECODER_BACKEND_DATABASE_URL / DATABASE_URL) — using in-memory "
            "store. Signals will NOT survive a restart."
        )
        await store.backend.initialize()
        return store.backend

    pg = PostgresWorkSignalStore(database_url)
    try:
        await pg.initialize()
    except Exception:
        # Durable storage failed to come up. Degrade to in-memory rather than
        # taking the whole service down, but make the failure impossible to miss.
        logger.exception(
            "Failed to initialize Postgres WorkSignal store — degrading to "
            "in-memory. Signals will NOT be persisted until the database is "
            "reachable."
        )
        await pg.close()
        await store.backend.initialize()
        return store.backend

    store._set_backend(pg)
    logger.info("WorkSignal persistence enabled: Postgres backend active.")
    return pg


async def shutdown_store() -> None:
    """Release backend resources. Call once at shutdown."""
    await store.close()
