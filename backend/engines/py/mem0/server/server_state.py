import json
import logging
import threading
from copy import deepcopy
from typing import Any, Callable, Dict

from mem0 import Memory

_state_lock = threading.RLock()
_current_config: Dict[str, Any] = {}
_memory_instance: Memory | None = None
_session_factory: Callable | None = None


def set_session_factory(factory: Callable) -> None:
    global _session_factory
    _session_factory = factory


def _load_overrides() -> Dict[str, Any]:
    try:
        if _session_factory is None:
            return {}
        from models import Settings

        session = _session_factory()
        try:
            row = session.get(Settings, "config_overrides")
            if row is None:
                return {}
            return json.loads(row.value)
        finally:
            session.close()
    except Exception:
        return {}


def _save_overrides(overrides: Dict[str, Any]) -> None:
    try:
        if _session_factory is None:
            return
        from models import Settings
        from sqlalchemy.dialects.postgresql import insert

        session = _session_factory()
        try:
            serialized = json.dumps(overrides)
            stmt = (
                insert(Settings)
                .values(key="config_overrides", value=serialized)
                .on_conflict_do_update(
                    index_elements=[Settings.key],
                    set_={"value": serialized},
                )
            )
            session.execute(stmt)
            session.commit()
        finally:
            session.close()
    except Exception:
        logging.warning("Failed to persist config overrides to database", exc_info=True)


def _merge_config(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = deepcopy(base)

    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_config(merged[key], value)
        else:
            merged[key] = value

    return merged


def set_default_config(default_config: Dict[str, Any]) -> None:
    """Record the effective configuration WITHOUT building a Memory instance.

    Building `Memory` opens the history DB and connects to the vector store, so
    doing it at import time makes the whole process refuse to start when those
    backends are unreachable. Callers stage the config here and let the instance
    be built lazily on first use (or eagerly via `initialize_state` at startup),
    keeping module import side-effect free."""
    global _current_config
    with _state_lock:
        _current_config = deepcopy(default_config)
        overrides = _load_overrides()
        if overrides:
            _current_config = _merge_config(_current_config, overrides)


def initialize_state(default_config: Dict[str, Any]) -> None:
    global _current_config, _memory_instance
    with _state_lock:
        _current_config = deepcopy(default_config)
        overrides = _load_overrides()
        if overrides:
            _current_config = _merge_config(_current_config, overrides)
        _memory_instance = Memory.from_config(_current_config)


def is_initialized() -> bool:
    with _state_lock:
        return _memory_instance is not None


def update_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    global _current_config, _memory_instance
    with _state_lock:
        next_config = _merge_config(_current_config, updates)
        _current_config = next_config
        _memory_instance = Memory.from_config(next_config)
        overrides = _load_overrides()
        overrides = _merge_config(overrides, updates)
        _save_overrides(overrides)
        return deepcopy(_current_config)


def get_current_config() -> Dict[str, Any]:
    with _state_lock:
        return deepcopy(_current_config)


def get_memory_instance() -> Memory:
    """Return the shared Memory instance, building it lazily on first use.

    Lazy construction lets the API process boot and serve liveness/docs even
    when the vector store or history DB is temporarily unreachable; the backing
    error only surfaces on the first request that actually needs memory."""
    global _memory_instance
    with _state_lock:
        if _memory_instance is None:
            if not _current_config:
                raise RuntimeError("Mem0 runtime has not been configured.")
            _memory_instance = Memory.from_config(_current_config)
        return _memory_instance
