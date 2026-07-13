"""Dependency-light RunEvent emitter for the PAL clink bridge.

This module lets the clink bridge report handoffs and results to the Recoder
control plane (Agent OS) by POSTing RunEvent JSON to the internal events
endpoint. It is intentionally stdlib-only (``urllib.request``) so it adds no new
pip dependencies.

Design contract:

- Emit RunEvents by POSTing JSON to
  ``{RECODER_INTERNAL_URL}/internal/agent-os/events`` with the header
  ``x-internal-service-key: {INTERNAL_SERVICE_KEY}``.
- Handoff (at spawn):
    ``{taskId, runId: <parent run id>, type: "handoff",
       data: {childRunId, cli_name, role}}``
- Result (on return):
    ``{taskId, runId: <childRunId>, type: "completed" | "failed",
       data: {parentRunId, truncated: <bool>}}``
- Identity is read from ``os.environ``: ``RECODER_RUN_ID``,
  ``RECODER_TASK_ID``, ``RECODER_INTERNAL_URL``, ``INTERNAL_SERVICE_KEY``.

CRITICAL: emission must never block or fail the clink bridge. If the control
plane is not configured (``RECODER_INTERNAL_URL`` or ``INTERNAL_SERVICE_KEY``
unset) emission is a silent no-op. Any error during emission is swallowed and
logged at debug/info; the bridge keeps working standalone with no control plane.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
import uuid

logger = logging.getLogger(__name__)

#: Path appended to ``RECODER_INTERNAL_URL`` to reach the events endpoint.
EVENTS_PATH = "/internal/agent-os/events"

#: Header carrying the internal service key for server-side validation.
SERVICE_KEY_HEADER = "x-internal-service-key"

#: Short request timeout (seconds). Emission must never stall the bridge.
REQUEST_TIMEOUT_SECONDS = 5


def _identity() -> dict[str, str | None]:
    """Read Recoder identity/config from the environment.

    Read lazily (per call) so tests can monkeypatch ``os.environ`` and so the
    bridge picks up env that is populated after import.
    """

    return {
        "run_id": os.environ.get("RECODER_RUN_ID"),
        "task_id": os.environ.get("RECODER_TASK_ID"),
        "internal_url": os.environ.get("RECODER_INTERNAL_URL"),
        "service_key": os.environ.get("INTERNAL_SERVICE_KEY"),
    }


def new_child_run_id() -> str:
    """Mint a fresh child run id for a spawned subprocess (uuid4 hex)."""

    return uuid.uuid4().hex


def emit_run_event(event: dict) -> None:
    """POST a RunEvent to the control plane. Never raises.

    No-op (returns immediately) when ``RECODER_INTERNAL_URL`` or
    ``INTERNAL_SERVICE_KEY`` is missing. Any error (network, encoding, unset
    env) is caught, logged at debug/info, and swallowed so the clink bridge is
    never blocked or failed by control-plane absence.
    """

    identity = _identity()
    internal_url = identity["internal_url"]
    service_key = identity["service_key"]

    if not internal_url or not service_key:
        logger.debug(
            "RunEvent emission skipped: control plane not configured "
            "(RECODER_INTERNAL_URL/INTERNAL_SERVICE_KEY unset)"
        )
        return

    try:
        url = internal_url.rstrip("/") + EVENTS_PATH
        body = json.dumps(event).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                SERVICE_KEY_HEADER: service_key,
            },
        )
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            # Drain/close so the connection is released; status is informational.
            status = getattr(response, "status", None)
            logger.debug("RunEvent emitted (%s) status=%s", event.get("type"), status)
    except Exception as exc:  # noqa: BLE001 - emission must never break the bridge
        logger.info("RunEvent emission failed (ignored): %s", exc)


def emit_handoff(
    task_id: str,
    parent_run_id: str,
    child_run_id: str,
    cli_name: str,
    role: str,
) -> None:
    """Emit a ``handoff`` RunEvent for a newly spawned clink subprocess.

    The handoff is recorded under the parent run id; the spawned child run id
    travels in ``data`` so the control plane can link parent -> child.
    """

    emit_run_event(
        {
            "taskId": task_id,
            "runId": parent_run_id,
            "type": "handoff",
            "data": {
                "childRunId": child_run_id,
                "cli_name": cli_name,
                "role": role,
            },
        }
    )


def emit_result(
    task_id: str,
    child_run_id: str,
    parent_run_id: str,
    success: bool,
    truncated: bool,
) -> None:
    """Emit a ``completed``/``failed`` RunEvent when a child subprocess returns.

    The result is recorded under the child run id; ``parentRunId`` links it back
    to the spawning run.
    """

    emit_run_event(
        {
            "taskId": task_id,
            "runId": child_run_id,
            "type": "completed" if success else "failed",
            "data": {
                "parentRunId": parent_run_id,
                "truncated": truncated,
            },
        }
    )
