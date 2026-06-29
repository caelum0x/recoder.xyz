"""WorkSignal repository contract.

Defines the single async interface every storage backend must satisfy. The
rest of the codebase depends on this Protocol, never on a concrete backend, so
swapping in-memory for Postgres (or anything else) requires no changes to the
detector / sync / API call sites.

The interface is async on purpose: the only call sites live inside FastAPI
async handlers and background tasks, and the production backend (Postgres via
asyncpg) is inherently async. The in-memory fallback implements the same async
methods over a plain dict — trivially correct and never blocking.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from models.workSignal import WorkSignal


@runtime_checkable
class WorkSignalRepository(Protocol):
    """Storage contract for detected ``WorkSignal`` items.

    All methods are coroutines. Implementations must be safe to call
    concurrently from multiple asyncio tasks.
    """

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Prepare the backend for use (open pools, verify schema, …).

        Must be idempotent — calling it more than once is a no-op after the
        first successful call. In-memory backends may implement this as a
        no-op.
        """
        ...

    async def close(self) -> None:
        """Release any resources held by the backend (connection pools, …).

        Must be safe to call even if :meth:`initialize` was never called.
        """
        ...

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def save(self, signal: WorkSignal) -> None:
        """Persist (or overwrite) a single ``WorkSignal``.

        Saving a signal whose ``id`` already exists replaces it, so re-syncing
        the same upstream item is idempotent.
        """
        ...

    async def save_many(self, signals: list[WorkSignal]) -> None:
        """Persist a batch of signals atomically where the backend supports it."""
        ...

    async def update_resolved(self, signal_id: str, resolved: bool) -> bool:
        """Mark a signal resolved or re-open it.

        Returns ``True`` if a signal with ``signal_id`` existed and was
        updated, ``False`` otherwise.
        """
        ...

    async def clear(self) -> None:
        """Remove every signal. Primarily for tests and manual resets."""
        ...

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get(self, signal_id: str) -> Optional[WorkSignal]:
        """Return a single signal by ``id``, or ``None`` if absent."""
        ...

    async def get_all(self) -> list[WorkSignal]:
        """Return all signals sorted by priority (high→medium→low) then
        detection time (oldest first)."""
        ...

    async def count(self) -> int:
        """Return the total number of stored signals."""
        ...


# ---------------------------------------------------------------------------
# Shared ordering helper — keep every backend's sort identical.
# ---------------------------------------------------------------------------

PRIORITY_ORDER: dict[str, int] = {"high": 0, "medium": 1, "low": 2}


def sort_signals(signals: list[WorkSignal]) -> list[WorkSignal]:
    """Sort signals by priority then detection time.

    Centralised so the in-memory and Postgres backends present results in the
    exact same order regardless of how they were stored.
    """
    return sorted(
        signals,
        key=lambda s: (PRIORITY_ORDER.get(s.priority, 99), s.detected_at),
    )
