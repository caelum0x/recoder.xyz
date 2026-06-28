"""Internal billing API surface: /internal/agent-os/billing/* (distribution.md §3.9).

The ONLY surface @recoder/distribution talks to. Two layers:

1. :class:`InternalApiGuard` — the framework-free authorization + health core. It
   enforces, in fail-safe order: engine health (missing secrets -> deny), the
   ``INTERNAL_SERVICE_KEY`` header (constant-time compare), and a verified signed
   envelope (``ipc/envelope``) with single-use nonce tracking. This is the real
   security logic and is unit-tested without FastAPI.

2. :func:`build_internal_router` — a thin FastAPI router that delegates auth to the
   guard and exposes the billing operations. FastAPI is imported lazily so the spine
   imports cleanly without it; the router lands fully wired in the follow-up fusion
   when the durable repositories/Postgres are present.

Fail-safe contract: when the engine is unhealthy (a required secret/URL is absent) the
guard DENIES every operation and reports ``unhealthy`` — it never fakes an allow.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from ..config.settings import Settings
from ..kit.crypto import constant_time_compare
from .envelope import Envelope, EnvelopeVerificationError, parse_envelope, verify_envelope

INTERNAL_API_PREFIX = "/internal/agent-os/billing"
INTERNAL_SERVICE_KEY_HEADER = "x-internal-service-key"


class AuthorizationError(Exception):
    """Raised when an internal request is not authorized. Carries an HTTP status + reason."""

    def __init__(self, reason: str, status_code: int, message: str | None = None) -> None:
        super().__init__(message or reason)
        self.reason = reason
        self.status_code = status_code


class NonceStore(Protocol):
    """Tracks consumed envelope nonces for replay protection."""

    def seen(self, nonce: str) -> bool: ...

    def remember(self, nonce: str) -> None: ...


class InMemoryNonceStore:
    """Process-local nonce store. Adequate for a single process; Redis-backed in prod."""

    def __init__(self) -> None:
        self._seen: set[str] = set()

    def seen(self, nonce: str) -> bool:
        return nonce in self._seen

    def remember(self, nonce: str) -> None:
        self._seen.add(nonce)


@dataclass(frozen=True)
class AuthorizedCall:
    """The result of a successful authorization: the verified caller, op, and payload."""

    caller: str
    operation: str
    payload: dict[str, Any]


class InternalApiGuard:
    """Framework-free authorization + health gate for the internal billing surface."""

    def __init__(self, settings: Settings, nonce_store: NonceStore | None = None) -> None:
        self._settings = settings
        self._nonces = nonce_store or InMemoryNonceStore()

    def health(self) -> dict[str, Any]:
        """Truthful health: ``ok`` only when every required secret/URL is present."""
        issues = self._settings.health_issues()
        return {
            "status": "ok" if not issues else "unhealthy",
            "healthy": len(issues) == 0,
            "issues": [{"key": i.key, "message": i.message} for i in issues],
        }

    def authorize(
        self,
        *,
        service_key_header: str | None,
        envelope_wire: dict[str, Any],
        now_ms: int | None = None,
    ) -> AuthorizedCall:
        """Authorize an internal call. Raises :class:`AuthorizationError` on any failure.

        Order is fail-safe: health first (missing secrets deny everything), then the
        shared service key, then the signed envelope (MAC + freshness + nonce).
        """
        # 1. Engine health — a missing secret means DENY, never a faked allow.
        if not self._settings.is_healthy():
            raise AuthorizationError(
                "unhealthy",
                503,
                "Billing engine is unhealthy (missing configuration); denying.",
            )

        # 2. INTERNAL_SERVICE_KEY — constant-time compare against the env value.
        expected_key = self._settings.internal_service_key
        if not service_key_header or not constant_time_compare(
            service_key_header, expected_key
        ):
            raise AuthorizationError(
                "invalid_service_key", 401, "Missing or invalid internal service key."
            )

        # 3. Signed envelope — parse + verify MAC, freshness, and single-use nonce.
        try:
            envelope = parse_envelope(envelope_wire)
        except EnvelopeVerificationError as e:
            raise AuthorizationError(e.reason, 400, str(e)) from e

        try:
            verify_envelope(
                envelope,
                signing_key=self._settings.envelope_signing_key,
                now_ms=now_ms,
                seen_nonce=self._nonces.seen(envelope.nonce),
            )
        except EnvelopeVerificationError as e:
            status = 503 if e.reason == "missing_signing_key" else 401
            raise AuthorizationError(e.reason, status, str(e)) from e

        self._nonces.remember(envelope.nonce)
        return AuthorizedCall(
            caller=envelope.caller,
            operation=envelope.operation,
            payload=dict(envelope.payload),
        )


def build_internal_router(guard: InternalApiGuard, *, operations: dict[str, Any]) -> Any:
    """Build the FastAPI router for ``/internal/agent-os/billing/*``.

    ``operations`` maps an operation name to an async handler ``(payload) -> result``.
    FastAPI is imported lazily so the spine imports without it. A health endpoint is
    always exposed (and is the one route that does not require an envelope, so callers
    can probe readiness before signing).
    """
    try:
        from fastapi import APIRouter, Header, Request  # type: ignore
        from fastapi.responses import JSONResponse  # type: ignore
    except ImportError as e:  # pragma: no cover - exercised only without FastAPI
        raise RuntimeError(
            "FastAPI is required to build the internal router. "
            "Install the 'api' extra: pip install 'recoder-billing[api]'."
        ) from e

    router = APIRouter(prefix=INTERNAL_API_PREFIX, tags=["internal-billing"])

    @router.get("/health")
    async def health() -> Any:  # pragma: no cover - requires FastAPI runtime
        report = guard.health()
        status = 200 if report["healthy"] else 503
        return JSONResponse(report, status_code=status)

    @router.post("/invoke")
    async def invoke(  # pragma: no cover - requires FastAPI runtime
        request: Request,
        x_internal_service_key: str | None = Header(default=None),
    ) -> Any:
        envelope_wire = await request.json()
        try:
            call = guard.authorize(
                service_key_header=x_internal_service_key,
                envelope_wire=envelope_wire,
            )
        except AuthorizationError as e:
            return JSONResponse(
                {"error": e.reason, "message": str(e)}, status_code=e.status_code
            )

        handler = operations.get(call.operation)
        if handler is None:
            return JSONResponse(
                {"error": "unknown_operation", "operation": call.operation},
                status_code=404,
            )
        result = await handler(call.payload)
        return JSONResponse({"caller": call.caller, "result": result})

    return router
