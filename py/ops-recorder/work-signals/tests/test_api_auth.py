from __future__ import annotations

from fastapi.testclient import TestClient

from main import app


def test_health_is_public(monkeypatch) -> None:
    monkeypatch.delenv("OPS_RECORDER_API_KEY", raising=False)
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_work_signals_fail_closed_without_configured_key(monkeypatch) -> None:
    monkeypatch.delenv("OPS_RECORDER_API_KEY", raising=False)
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    response = TestClient(app).get("/work-signals")

    assert response.status_code == 503


def test_work_signals_require_matching_api_key(monkeypatch) -> None:
    monkeypatch.setenv("OPS_RECORDER_API_KEY", "test-key")
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    client = TestClient(app)
    assert client.get("/work-signals").status_code == 401
    assert client.get("/work-signals", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/work-signals", headers={"X-API-Key": "test-key"}).status_code == 200
