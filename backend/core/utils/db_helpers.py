"""
Database compatibility helpers.

Runtime paths are SQL-only via ``core.services.db``.
Legacy Supabase-client semantics are intentionally removed.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Dict, Optional

from core.services.db import close_db, init_db
from core.utils.logger import logger


class DBConnection:
    """Singleton compatibility wrapper over SQL database lifecycle."""

    _instance: Optional["DBConnection"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
                    cls._instance._async_lock = None
                    cls._instance._init_time = None
                    cls._instance._request_count = 0
                    cls._instance._error_count = 0
        return cls._instance

    def __init__(self):
        pass

    def get_connection_stats(self) -> Dict[str, Any]:
        uptime = time.time() - self._init_time if self._init_time else 0
        return {
            "initialized": self._initialized,
            "uptime_seconds": round(uptime, 1),
            "request_count": self._request_count,
            "error_count": self._error_count,
        }

    async def initialize(self):
        if self._initialized:
            return

        if self._async_lock is None:
            self._async_lock = asyncio.Lock()

        async with self._async_lock:
            if self._initialized:
                return
            await init_db()
            self._initialized = True
            self._init_time = time.time()
            self._request_count = 0
            self._error_count = 0
            logger.info("Database compatibility wrapper initialized (SQL runtime)")

    async def reset_connection(self):
        await close_db()
        self._initialized = False

    async def force_reconnect(self):
        logger.warning("Forcing SQL database reconnection...")
        await self.reset_connection()
        await self.initialize()
        logger.info("Database reconnected")

    @property
    async def client(self):
        raise RuntimeError(
            "Supabase-style client access has been removed. "
            "Use core.services.db helpers (execute/execute_one/execute_mutate/Table)."
        )

    @classmethod
    async def disconnect(cls):
        await close_db()
        if cls._instance:
            cls._instance._initialized = False
        logger.info("Database disconnected")

    @staticmethod
    def is_recoverable_connection_error(error) -> bool:
        error_str = str(error).lower()
        return (
            ("connection reset" in error_str)
            or ("connection refused" in error_str)
            or ("too many connections" in error_str)
            or ("timeout" in error_str)
        )

    @staticmethod
    def is_client_closed_error(error) -> bool:
        return "closed" in str(error).lower()


async def execute_with_reconnect(db: DBConnection, operation, max_retries: int = 2):
    """Execute operation with SQL pool reconnect on recoverable errors."""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            await db.initialize()
            return await operation(None)
        except Exception as e:
            last_error = e
            if DBConnection.is_recoverable_connection_error(e) and attempt < max_retries:
                logger.warning(
                    f"Recoverable database error (attempt {attempt + 1}/{max_retries + 1}), reconnecting..."
                )
                await db.force_reconnect()
            else:
                raise
    raise last_error


_db_instance: DBConnection | None = None


async def get_db() -> DBConnection:
    global _db_instance
    if _db_instance is None:
        _db_instance = DBConnection()
        await _db_instance.initialize()
        logger.debug("Database connection initialized via dependency")
    return _db_instance


async def get_db_client():
    raise RuntimeError(
        "get_db_client() is removed from runtime. "
        "Use core.services.db helpers in runtime code."
    )


def get_initialized_db() -> DBConnection:
    global _db_instance
    if _db_instance is None:
        _db_instance = DBConnection()
        logger.debug("Created DBConnection instance (needs initialization)")
    return _db_instance


def reset_db_singletons() -> None:
    global _db_instance
    _db_instance = None
    DBConnection._instance = None


async def init_sql_db() -> None:
    await init_db()


async def close_sql_db() -> None:
    await close_db()
