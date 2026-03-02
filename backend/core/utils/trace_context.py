"""
SFA-011 — Interop trace context utilities.

Provides:
  * W3C ``traceparent`` header parsing (version 00)
  * Trace-id / request-id generation helpers
  * ``contextvars``-based storage so any code in the same async task can
    retrieve the current trace context without needing the ``Request`` object
  * A lightweight ``TraceContext`` dataclass carried through the request
"""

from __future__ import annotations

import re
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Context variable – one per async task / request
# ---------------------------------------------------------------------------

_trace_ctx_var: ContextVar["TraceContext"] = ContextVar("trace_context")


@dataclass(frozen=False)
class TraceContext:
    """Immutable-ish bag of interop trace fields for a single request."""

    trace_id: str
    request_id: str
    parent_id: Optional[str] = None
    trace_flags: str = "00"
    connector_id: str = "unknown"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def as_response_meta(self) -> dict:
        """Return a dict suitable for embedding in JSON response bodies."""
        meta: dict = {
            "trace_id": self.trace_id,
            "request_id": self.request_id,
            "timestamp": self.timestamp,
        }
        if self.connector_id and self.connector_id != "unknown":
            meta["connector_id"] = self.connector_id
        return meta

    def as_log_fields(self) -> dict:
        """Return a dict suitable for ``structlog.contextvars.bind_contextvars``."""
        fields: dict = {
            "trace_id": self.trace_id,
            "request_id": self.request_id,
        }
        if self.parent_id:
            fields["parent_id"] = self.parent_id
        if self.connector_id and self.connector_id != "unknown":
            fields["connector_id"] = self.connector_id
        return fields

    def as_response_headers(self) -> dict[str, str]:
        """Return headers to set on the outgoing HTTP response."""
        headers: dict[str, str] = {
            "X-Trace-Id": self.trace_id,
            "X-Request-Id": self.request_id,
        }
        if self.connector_id and self.connector_id != "unknown":
            headers["X-Connector-Id"] = self.connector_id
        headers["X-Interop-Metadata"] = "trace-id,request-id,connector-id"
        return headers


# ---------------------------------------------------------------------------
# W3C traceparent parsing  (https://www.w3.org/TR/trace-context/)
# Format: {version}-{trace-id}-{parent-id}-{trace-flags}
#   e.g. "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
# ---------------------------------------------------------------------------

_TRACEPARENT_RE = re.compile(
    r"^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$"
)


def parse_traceparent(header: Optional[str]) -> tuple[Optional[str], Optional[str], str]:
    """Parse a W3C ``traceparent`` header value.

    Returns ``(trace_id, parent_id, trace_flags)`` on success.
    Returns ``(None, None, "00")`` when the header is absent or invalid.
    """
    if not header:
        return None, None, "00"
    m = _TRACEPARENT_RE.match(header.strip().lower())
    if not m:
        return None, None, "00"
    _version, trace_id, parent_id, trace_flags = m.groups()
    # All-zero trace-id or parent-id are invalid per spec
    if trace_id == "0" * 32 or parent_id == "0" * 16:
        return None, None, "00"
    return trace_id, parent_id, trace_flags


def generate_trace_id() -> str:
    """Generate a 32-hex-char trace id compatible with W3C Trace Context."""
    return uuid.uuid4().hex


def generate_request_id() -> str:
    """Generate a standard UUID-4 request id."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Public helpers for getting / setting context
# ---------------------------------------------------------------------------

def set_trace_context(ctx: TraceContext) -> None:
    """Store *ctx* in the current ``contextvars`` context."""
    _trace_ctx_var.set(ctx)


def get_trace_context() -> Optional[TraceContext]:
    """Return the current ``TraceContext``, or ``None`` outside a request."""
    return _trace_ctx_var.get(None)


def get_trace_id() -> Optional[str]:
    """Convenience: return just the trace_id, or ``None``."""
    ctx = get_trace_context()
    return ctx.trace_id if ctx else None


def get_request_id() -> Optional[str]:
    """Convenience: return just the request_id, or ``None``."""
    ctx = get_trace_context()
    return ctx.request_id if ctx else None


def build_trace_context_from_headers(
    headers: dict | None = None,
    query_params: dict | None = None,
) -> TraceContext:
    """Build a ``TraceContext`` from incoming HTTP headers / query params.

    Resolution order for *trace_id*:
      1. W3C ``traceparent`` header
      2. ``X-Trace-Id`` header
      3. ``X-Request-Id`` header
      4. ``trace_id`` / ``traceId`` query parameter
      5. Freshly generated value
    """
    headers = headers or {}
    query_params = query_params or {}

    # --- trace_id ---
    tp_trace, tp_parent, tp_flags = parse_traceparent(headers.get("traceparent"))

    trace_id = (
        tp_trace
        or headers.get("x-trace-id")
        or headers.get("x-request-id")
        or query_params.get("trace_id")
        or query_params.get("traceId")
        or generate_trace_id()
    )

    parent_id = tp_parent

    # --- request_id is always new per-request ---
    request_id = generate_request_id()

    connector_id = (
        headers.get("x-connector-id")
        or query_params.get("connector_id")
        or query_params.get("connectorId")
        or "unknown"
    )

    return TraceContext(
        trace_id=trace_id,
        request_id=request_id,
        parent_id=parent_id,
        trace_flags=tp_flags,
        connector_id=connector_id,
    )


# ---------------------------------------------------------------------------
# FastAPI dependency — inject response metadata into route handlers
# ---------------------------------------------------------------------------

def get_response_meta() -> dict:
    """FastAPI dependency returning interop metadata for JSON response bodies.

    Usage in a route::

        from core.utils.trace_context import get_response_meta

        @router.get("/example")
        async def example(meta: dict = Depends(get_response_meta)):
            return {"data": ..., "_meta": meta}
    """
    ctx = get_trace_context()
    if ctx:
        return ctx.as_response_meta()
    return {
        "trace_id": generate_trace_id(),
        "request_id": generate_request_id(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
