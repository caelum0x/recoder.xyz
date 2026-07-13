"""In-memory ``WorkSignalRepository`` implementation.

The default / fallback backend. Holds signals in a plain dict.

Every method is a coroutine to satisfy the async repository contract, but each
one performs only synchronous dict work with no internal ``await``. That makes
each call atomic with respect to the event loop — there is no yield point at
which another task could observe a half-applied mutation — so no explicit lock
is required, and the store is safe to use across successive event loops (e.g.
repeated ``asyncio.run`` calls in tests).

There is no persistence between restarts — that is intentional for this
backend. Use the Postgres backend when durability is required.
"""

from __future__ import annotations

from typing import Optional

from models.workSignal import WorkSignal
from storage.workSignalRepository import sort_signals


class InMemoryWorkSignalStore:
    """Async, in-process ``WorkSignalRepository`` backed by a dict."""

    def __init__(self) -> None:
        self._signals: dict[str, WorkSignal] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """No-op — the dict is ready the moment the instance exists."""
        return None

    async def close(self) -> None:
        """No-op — nothing to release."""
        return None

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    async def save(self, signal: WorkSignal) -> None:
        self._signals[signal.id] = signal

    async def save_many(self, signals: list[WorkSignal]) -> None:
        for signal in signals:
            self._signals[signal.id] = signal

    async def update_resolved(self, signal_id: str, resolved: bool) -> bool:
        signal = self._signals.get(signal_id)
        if signal is None:
            return False
        # WorkSignal is a Pydantic model — rebuild with the changed field
        # instead of mutating in place.
        self._signals[signal_id] = signal.model_copy(update={"resolved": resolved})
        return True

    async def clear(self) -> None:
        self._signals.clear()

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get(self, signal_id: str) -> Optional[WorkSignal]:
        return self._signals.get(signal_id)

    async def get_all(self) -> list[WorkSignal]:
        return sort_signals(list(self._signals.values()))

    async def count(self) -> int:
        return len(self._signals)
