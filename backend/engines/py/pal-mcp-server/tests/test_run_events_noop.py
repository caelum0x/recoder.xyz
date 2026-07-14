"""No-op + wiring tests for the clink RunEvent emitter.

These assert the two halves of the contract:

(a) With the control plane unconfigured (RECODER_INTERNAL_URL or
    INTERNAL_SERVICE_KEY unset) every emit_* helper is a clean no-op: no
    exception is raised and ``urllib.request.urlopen`` is NEVER called.
(b) With the control plane configured, emission POSTs to
    ``{RECODER_INTERNAL_URL}/internal/agent-os/events`` with the
    ``x-internal-service-key`` header and the contract JSON body.

No real network is performed: ``urllib.request.urlopen`` is monkeypatched.
"""

from __future__ import annotations

import json
import urllib.request
from contextlib import contextmanager

import pytest

from clink import run_events


@contextmanager
def _captured_urlopen(monkeypatch):
    """Patch urlopen to record calls and never hit the network."""

    calls: list[dict] = []

    class _FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def fake_urlopen(request, timeout=None):
        calls.append({"request": request, "timeout": timeout})
        return _FakeResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    yield calls


def _clear_identity_env(monkeypatch):
    for key in (
        "RECODER_RUN_ID",
        "RECODER_TASK_ID",
        "RECODER_INTERNAL_URL",
        "INTERNAL_SERVICE_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


# ---------------------------------------------------------------------------
# (a) Unconfigured -> silent no-op, urlopen never called, no exception.
# ---------------------------------------------------------------------------


def test_emit_run_event_noop_when_fully_unconfigured(monkeypatch):
    _clear_identity_env(monkeypatch)
    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_run_event({"type": "handoff", "data": {}})
    assert calls == [], "urlopen must NOT be called when control plane is unconfigured"


def test_emit_run_event_noop_when_only_url_set(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://localhost:3001")
    # INTERNAL_SERVICE_KEY still unset -> no-op.
    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_run_event({"type": "handoff", "data": {}})
    assert calls == [], "urlopen must NOT be called without INTERNAL_SERVICE_KEY"


def test_emit_run_event_noop_when_only_key_set(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "secret")
    # RECODER_INTERNAL_URL still unset -> no-op.
    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_run_event({"type": "handoff", "data": {}})
    assert calls == [], "urlopen must NOT be called without RECODER_INTERNAL_URL"


def test_emit_helpers_are_clean_noops_when_unconfigured(monkeypatch):
    _clear_identity_env(monkeypatch)
    with _captured_urlopen(monkeypatch) as calls:
        # None of these should raise or touch the network.
        run_events.emit_handoff(
            task_id="t1",
            parent_run_id="parent",
            child_run_id="child",
            cli_name="codex",
            role="default",
        )
        run_events.emit_result(
            task_id="t1",
            child_run_id="child",
            parent_run_id="parent",
            success=True,
            truncated=False,
        )
    assert calls == [], "emit_* helpers must be no-ops when unconfigured"


def test_emit_run_event_swallows_errors(monkeypatch):
    """Even when configured, a urlopen error must not propagate."""

    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://localhost:3001")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "secret")

    def boom(_request, timeout=None):
        raise OSError("connection refused")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    # Must NOT raise.
    run_events.emit_run_event({"type": "handoff", "data": {}})


# ---------------------------------------------------------------------------
# (b) Configured -> urlopen called with correct URL, header, and body.
# ---------------------------------------------------------------------------


def test_emit_run_event_posts_with_correct_url_and_header(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://localhost:3001")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "secret-key")

    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_run_event({"type": "handoff", "data": {"childRunId": "c1"}})

    assert len(calls) == 1, "urlopen must be called exactly once when configured"
    request = calls[0]["request"]
    assert request.full_url == "http://localhost:3001/internal/agent-os/events"
    assert request.get_method() == "POST"
    # urllib normalizes header keys to capitalized form.
    assert request.headers.get("X-internal-service-key") == "secret-key"
    assert request.headers.get("Content-type") == "application/json"
    body = json.loads(request.data.decode("utf-8"))
    assert body == {"type": "handoff", "data": {"childRunId": "c1"}}
    assert calls[0]["timeout"] == run_events.REQUEST_TIMEOUT_SECONDS


def test_emit_run_event_strips_trailing_slash_on_url(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://localhost:3001/")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "k")

    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_run_event({"type": "completed", "data": {}})

    assert calls[0]["request"].full_url == "http://localhost:3001/internal/agent-os/events"


def test_emit_handoff_builds_contract_json(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://cp")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "k")

    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_handoff(
            task_id="task-42",
            parent_run_id="run-parent",
            child_run_id="run-child",
            cli_name="codex",
            role="planner",
        )

    body = json.loads(calls[0]["request"].data.decode("utf-8"))
    assert body == {
        "taskId": "task-42",
        "runId": "run-parent",
        "type": "handoff",
        "data": {
            "childRunId": "run-child",
            "cli_name": "codex",
            "role": "planner",
        },
    }


def test_emit_result_success_builds_completed(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://cp")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "k")

    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_result(
            task_id="task-42",
            child_run_id="run-child",
            parent_run_id="run-parent",
            success=True,
            truncated=False,
        )

    body = json.loads(calls[0]["request"].data.decode("utf-8"))
    assert body == {
        "taskId": "task-42",
        "runId": "run-child",
        "type": "completed",
        "data": {"parentRunId": "run-parent", "truncated": False},
    }


def test_emit_result_failure_builds_failed_with_truncated(monkeypatch):
    _clear_identity_env(monkeypatch)
    monkeypatch.setenv("RECODER_INTERNAL_URL", "http://cp")
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "k")

    with _captured_urlopen(monkeypatch) as calls:
        run_events.emit_result(
            task_id="task-42",
            child_run_id="run-child",
            parent_run_id="run-parent",
            success=False,
            truncated=True,
        )

    body = json.loads(calls[0]["request"].data.decode("utf-8"))
    assert body == {
        "taskId": "task-42",
        "runId": "run-child",
        "type": "failed",
        "data": {"parentRunId": "run-parent", "truncated": True},
    }


def test_new_child_run_id_is_unique_hex(monkeypatch):
    a = run_events.new_child_run_id()
    b = run_events.new_child_run_id()
    assert a != b
    assert len(a) == 32
    int(a, 16)  # valid hex
