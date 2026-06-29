"""Runnable ASGI entrypoint for the recoder-billing internal engine.

This is the thin, degrade-safe HTTP surface the Node backend's billing seam
(`BILLING_BASE_URL`, `docker-backend/src/distribution/billing-ipc.ts`) talks to.
It mounts exactly one always-available route — ``GET /internal/agent-os/billing/health``
— plus ``POST /internal/agent-os/billing/invoke`` for signed operations.

Design constraints (mirrors the rest of py/ for this repo):

* **Imports cleanly without the heavy fusion.** The pure spine (`config`, `ipc`,
  `kit`) needs only stdlib + PyJWT. FastAPI is the only *web* dependency required to
  actually serve; it is imported lazily inside :func:`create_app` so that
  ``python -m py_compile`` and a plain ``import recoder_billing.app`` both succeed
  even when FastAPI is absent (``FASTAPI_AVAILABLE`` records why).
* **Truthful, fail-safe health.** Health is computed by :class:`InternalApiGuard`
  from :class:`Settings`: ``healthy:true`` only when every required secret/URL is
  present. A missing secret yields ``503`` + an explicit issue list — never a faked
  "ok". This is exactly what ``billingIpcHealth`` on the Node side expects.
* **Operations are best-effort.** The full checkout/subscription/order/webhook
  fusion is injected by the host via :func:`recoder_billing.ipc.operations`. When
  those durable ports are not wired, the engine still serves ``/health`` and returns
  ``404 unknown_operation`` for ``/invoke`` — it degrades, it does not crash.

Run it (after ``pip install 'fastapi[standard]' uvicorn pyjwt`` — the lightweight
``api`` extra, NOT the heavy ML stack)::

    uvicorn recoder_billing.app:app --host 127.0.0.1 --port 8896

Then point the backend at it: ``BILLING_BASE_URL=http://127.0.0.1:8896``.

Environment (read once via :func:`recoder_billing.config.settings.get_settings`):
    SECRET, INTERNAL_SERVICE_KEY, BILLING_ENVELOPE_SIGNING_KEY, POLAR_ACCESS_TOKEN,
    BILLING_TOKEN_HASH_SECRET, AUTH_SOURCE_OF_TRUTH_URL, BILLING_BASE_URL,
    RECODER_BILLING_ENV (development|testing|sandbox|production).
"""

from __future__ import annotations

import os
from typing import Any

from .config.settings import get_settings
from .ipc.internal_api import InternalApiGuard, build_internal_router

# Guarded *web* import: keep ``py_compile`` and plain ``import`` working without
# FastAPI installed. ``FASTAPI_AVAILABLE`` gates the ability to build a live app.
try:  # pragma: no cover - depends on the optional ``api`` extra
    import fastapi  # noqa: F401

    FASTAPI_AVAILABLE = True
    FASTAPI_IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover - exercised only without FastAPI
    FASTAPI_AVAILABLE = False
    FASTAPI_IMPORT_ERROR = str(exc)


def _load_operations() -> dict[str, Any]:
    """Best-effort: return the host-wired billing operations, else an empty map.

    The full operations map (`ipc.operations.build_billing_operations`) requires the
    durable repositories/processors the host injects. When those are not present (a
    health-only deployment, or the heavy fusion is not installed), we degrade to an
    empty map so ``/health`` still serves and ``/invoke`` returns a clean 404 rather
    than crashing the process at import time.
    """
    if os.getenv("BILLING_DISABLE_OPERATIONS", "").strip() == "1":
        return {}
    try:  # pragma: no cover - requires the full fused spine + injected ports
        from .ipc.operations import build_billing_operations, BillingPorts  # type: ignore  # noqa: F401

        # No host ports are available in the standalone health/degraded runner, so we
        # intentionally expose no operations. The host process that owns the durable
        # ports builds and passes them explicitly when it embeds this app.
        return {}
    except Exception:
        return {}


def create_app() -> Any:
    """Build the FastAPI app. Raises a clear error when FastAPI is not installed."""
    if not FASTAPI_AVAILABLE:
        raise RuntimeError(
            "FastAPI is required to serve the billing engine. Install the lightweight "
            "api extra: pip install 'recoder-billing[api]' (or `pip install fastapi "
            f"uvicorn pyjwt`). Import error was: {FASTAPI_IMPORT_ERROR}"
        )

    from fastapi import FastAPI  # local import keeps module import light
    from fastapi.responses import JSONResponse

    settings = get_settings()
    guard = InternalApiGuard(settings)

    app = FastAPI(
        title="Recoder Billing Engine",
        description=(
            "Internal billing & entitlement IPC surface "
            "(/internal/agent-os/billing/*). The only surface @recoder/distribution "
            "talks to. Fail-safe: missing secrets deny every operation."
        ),
        version="0.1.0",
    )

    # The internal router always exposes /health (no envelope) + /invoke (signed).
    app.include_router(build_internal_router(guard, operations=_load_operations()))

    @app.get("/health", tags=["meta"], include_in_schema=False)
    async def root_health() -> Any:  # pragma: no cover - requires FastAPI runtime
        """Liveness convenience alias. The truthful billing readiness lives at
        ``/internal/agent-os/billing/health``; this only proves the process is up."""
        report = guard.health()
        return JSONResponse(
            {"status": "up", "billing_healthy": report["healthy"]}, status_code=200
        )

    return app


# Module-level ASGI app for ``uvicorn recoder_billing.app:app``. Built only when
# FastAPI is present; otherwise ``app`` stays None so a plain import never fails and
# the launcher can report the missing dependency truthfully.
app = create_app() if FASTAPI_AVAILABLE else None


if __name__ == "__main__":  # pragma: no cover
    if not FASTAPI_AVAILABLE:
        raise SystemExit(
            "Cannot start billing engine: FastAPI not installed. "
            f"({FASTAPI_IMPORT_ERROR}). Run: pip install fastapi uvicorn pyjwt"
        )
    import uvicorn  # type: ignore

    uvicorn.run(
        "recoder_billing.app:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8896")),
        log_level="info",
    )
