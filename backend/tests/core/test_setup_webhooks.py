import hmac
import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from core.setup import api as setup_api


def _build_request(body: bytes) -> Request:
    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {"type": "http", "method": "POST", "path": "/webhooks/vercel-drain", "headers": []}
    return Request(scope, receive)


def test_extract_user_name_uses_metadata_full_name():
    user_record = {"raw_user_meta_data": {"full_name": "Ada Lovelace"}}
    assert setup_api._extract_user_name(user_record, "ada@example.com") == "Ada Lovelace"


def test_extract_user_name_falls_back_to_email_prefix():
    user_record = {"raw_user_meta_data": {}}
    assert setup_api._extract_user_name(user_record, "john_doe-dev@example.com") == "John Doe Dev"


def test_verify_webhook_secret_accepts_matching_secret(monkeypatch):
    monkeypatch.setattr(
        setup_api,
        "config",
        SimpleNamespace(DATABASE_WEBHOOK_SECRET="expected-secret", VERCEL_DRAIN_SECRET=None),
    )
    assert setup_api.verify_webhook_secret("expected-secret") is True


def test_verify_webhook_secret_rejects_mismatch(monkeypatch):
    monkeypatch.setattr(
        setup_api,
        "config",
        SimpleNamespace(DATABASE_WEBHOOK_SECRET="expected-secret", VERCEL_DRAIN_SECRET=None),
    )
    with pytest.raises(HTTPException) as exc:
        setup_api.verify_webhook_secret("wrong-secret")
    assert exc.value.status_code == 401


def test_verify_webhook_secret_fails_when_missing_config(monkeypatch):
    monkeypatch.setattr(setup_api, "config", SimpleNamespace(DATABASE_WEBHOOK_SECRET=None, VERCEL_DRAIN_SECRET=None))
    with pytest.raises(HTTPException) as exc:
        setup_api.verify_webhook_secret("anything")
    assert exc.value.status_code == 500


def test_verify_vercel_signature():
    body = b'{"eventType":"pageview"}'
    secret = "drain-secret"
    signature = hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()
    assert setup_api.verify_vercel_signature(body, signature, secret) is True
    assert setup_api.verify_vercel_signature(body, "bad-signature", secret) is False


@pytest.mark.asyncio
async def test_receive_vercel_drain_processes_pageviews(monkeypatch):
    body = (
        b'{"eventType":"pageview","deviceId":1234,"timestamp":1704067200000}\n'
        b'{"eventType":"click","deviceId":9999}\n'
    )
    req = _build_request(body)
    mutate = AsyncMock()

    monkeypatch.setattr(setup_api, "execute_mutate", mutate)
    monkeypatch.setattr(setup_api, "config", SimpleNamespace(VERCEL_DRAIN_SECRET=None, DATABASE_WEBHOOK_SECRET=None))

    result = await setup_api.receive_vercel_drain(req)

    assert result["status"] == "ok"
    assert result["processed"] == 1
    mutate.assert_awaited_once()
    _, params = mutate.await_args.args
    assert params["p_device_id"] == "1234"
    assert params["p_date"] == "2024-01-01"


@pytest.mark.asyncio
async def test_receive_vercel_drain_requires_signature_when_secret_configured(monkeypatch):
    req = _build_request(b'{"eventType":"pageview","deviceId":1}')
    monkeypatch.setattr(
        setup_api,
        "config",
        SimpleNamespace(VERCEL_DRAIN_SECRET="drain-secret", DATABASE_WEBHOOK_SECRET=None),
    )

    with pytest.raises(HTTPException) as exc:
        await setup_api.receive_vercel_drain(req, x_vercel_signature=None)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Missing signature"


@pytest.mark.asyncio
async def test_receive_vercel_drain_rejects_invalid_signature(monkeypatch):
    req = _build_request(b'{"eventType":"pageview","deviceId":1}')
    monkeypatch.setattr(
        setup_api,
        "config",
        SimpleNamespace(VERCEL_DRAIN_SECRET="drain-secret", DATABASE_WEBHOOK_SECRET=None),
    )

    with pytest.raises(HTTPException) as exc:
        await setup_api.receive_vercel_drain(req, x_vercel_signature="invalid")
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid signature"


@pytest.mark.asyncio
async def test_receive_vercel_drain_rejects_invalid_json(monkeypatch):
    req = _build_request(b"{bad-json")
    monkeypatch.setattr(setup_api, "config", SimpleNamespace(VERCEL_DRAIN_SECRET=None, DATABASE_WEBHOOK_SECRET=None))

    with pytest.raises(HTTPException) as exc:
        await setup_api.receive_vercel_drain(req)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid JSON payload"
