"""Postgres ``WorkSignalRepository`` implementation (asyncpg).

Persists detected signals to the ``recoder_backend`` database so they survive
restarts. Uses a single connection pool and parameterized queries throughout —
no string interpolation of user/source data into SQL.

Connection string resolution (first match wins):
    1. ``WORK_SIGNALS_DATABASE_URL``  — explicit, highest precedence.
    2. ``RECODER_BACKEND_DATABASE_URL``
    3. ``DATABASE_URL``

If none are set, this backend is not selected (see ``workSignalStore.py``); the
service falls back to the in-memory store and logs a warning.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

import asyncpg

from models.workSignal import ItemType, Source, WorkSignal
from storage.workSignalRepository import PRIORITY_ORDER

logger = logging.getLogger("work_signals.storage.postgres")

# Env vars checked, in precedence order, for the connection URL.
_DB_URL_ENV_VARS = (
    "WORK_SIGNALS_DATABASE_URL",
    "RECODER_BACKEND_DATABASE_URL",
    "DATABASE_URL",
)

_MIGRATION_FILE = Path(__file__).parent / "migrations" / "001_work_signals.sql"

# Columns in a stable order — shared by INSERT and SELECT so positional
# row -> model mapping stays in sync.
_COLUMNS = (
    "id",
    "source",
    "item_type",
    "title",
    "source_url",
    "assignee",
    "status",
    "detected_reason",
    "priority",
    "why_it_matters",
    "recommended_next_action",
    "agent_handoff_prompt",
    "resolved",
    "created_at",
    "detected_at",
)


def resolve_database_url() -> Optional[str]:
    """Return the configured Postgres URL, or ``None`` if none is set."""
    for name in _DB_URL_ENV_VARS:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def _record_to_signal(record: asyncpg.Record) -> WorkSignal:
    """Build a ``WorkSignal`` from a fetched row.

    asyncpg returns native Python types (``datetime`` for ``timestamptz``,
    ``bool`` for ``boolean``), so this is a direct field map. The enum fields
    are validated by Pydantic on construction, so a corrupt ``source`` /
    ``item_type`` value fails loudly instead of silently.
    """
    return WorkSignal(
        id=record["id"],
        source=Source(record["source"]),
        item_type=ItemType(record["item_type"]),
        title=record["title"],
        source_url=record["source_url"],
        assignee=record["assignee"],
        status=record["status"],
        detected_reason=record["detected_reason"],
        priority=record["priority"],
        why_it_matters=record["why_it_matters"],
        recommended_next_action=record["recommended_next_action"],
        agent_handoff_prompt=record["agent_handoff_prompt"],
        resolved=record["resolved"],
        created_at=record["created_at"],
        detected_at=record["detected_at"],
    )


def _signal_to_params(signal: WorkSignal) -> tuple[Any, ...]:
    """Flatten a ``WorkSignal`` into positional query params matching ``_COLUMNS``."""
    return (
        signal.id,
        signal.source.value,
        signal.item_type.value,
        signal.title,
        signal.source_url,
        signal.assignee,
        signal.status,
        signal.detected_reason,
        signal.priority,
        signal.why_it_matters,
        signal.recommended_next_action,
        signal.agent_handoff_prompt,
        signal.resolved,
        signal.created_at,
        signal.detected_at,
    )


# Build the UPSERT once from _COLUMNS so columns/placeholders never drift.
def _build_upsert_sql() -> str:
    cols = ", ".join(_COLUMNS)
    placeholders = ", ".join(f"${i}" for i in range(1, len(_COLUMNS) + 1))
    # Re-syncing the same item overwrites every mutable column.
    updates = ", ".join(
        f"{col} = EXCLUDED.{col}" for col in _COLUMNS if col != "id"
    )
    return (
        f"INSERT INTO work_signals ({cols}, stored_at) "
        f"VALUES ({placeholders}, now()) "
        f"ON CONFLICT (id) DO UPDATE SET {updates}, stored_at = now()"
    )


_UPSERT_SQL = _build_upsert_sql()
_SELECT_COLS = ", ".join(_COLUMNS)


class PostgresWorkSignalStore:
    """Durable ``WorkSignalRepository`` backed by Postgres via asyncpg."""

    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise ValueError("PostgresWorkSignalStore requires a non-empty database_url")
        self._database_url = database_url
        self._pool: Optional[asyncpg.Pool] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Open the pool and ensure the schema exists. Idempotent."""
        if self._pool is not None:
            return
        self._pool = await asyncpg.create_pool(
            self._database_url,
            min_size=1,
            max_size=10,
            command_timeout=30,
        )
        await self._apply_migration()
        logger.info("Postgres WorkSignal store initialized.")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def _apply_migration(self) -> None:
        """Run the table DDL idempotently so a fresh DB is provisioned."""
        try:
            ddl = _MIGRATION_FILE.read_text(encoding="utf-8")
        except OSError:
            logger.exception("Could not read migration file %s", _MIGRATION_FILE)
            raise
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute(ddl)

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError(
                "PostgresWorkSignalStore.initialize() must be awaited before use."
            )
        return self._pool

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def save(self, signal: WorkSignal) -> None:
        pool = self._require_pool()
        await pool.execute(_UPSERT_SQL, *_signal_to_params(signal))

    async def save_many(self, signals: list[WorkSignal]) -> None:
        if not signals:
            return
        pool = self._require_pool()
        rows = [_signal_to_params(s) for s in signals]
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(_UPSERT_SQL, rows)

    async def update_resolved(self, signal_id: str, resolved: bool) -> bool:
        pool = self._require_pool()
        # RETURNING id lets us distinguish "row updated" from "no such row"
        # without a second query.
        row = await pool.fetchrow(
            "UPDATE work_signals SET resolved = $1, stored_at = now() "
            "WHERE id = $2 RETURNING id",
            resolved,
            signal_id,
        )
        return row is not None

    async def clear(self) -> None:
        pool = self._require_pool()
        await pool.execute("TRUNCATE TABLE work_signals")

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get(self, signal_id: str) -> Optional[WorkSignal]:
        pool = self._require_pool()
        row = await pool.fetchrow(
            f"SELECT {_SELECT_COLS} FROM work_signals WHERE id = $1",
            signal_id,
        )
        return _record_to_signal(row) if row is not None else None

    async def get_all(self) -> list[WorkSignal]:
        pool = self._require_pool()
        # Order in SQL using a CASE so high→medium→low matches PRIORITY_ORDER
        # exactly (alphabetical priority would mis-order them).
        case_branches = " ".join(
            f"WHEN priority = '{name}' THEN {rank}"
            for name, rank in PRIORITY_ORDER.items()
        )
        rows = await pool.fetch(
            f"SELECT {_SELECT_COLS} FROM work_signals "
            f"ORDER BY (CASE {case_branches} ELSE 99 END), detected_at"
        )
        return [_record_to_signal(r) for r in rows]

    async def count(self) -> int:
        pool = self._require_pool()
        value = await pool.fetchval("SELECT count(*) FROM work_signals")
        return int(value or 0)
