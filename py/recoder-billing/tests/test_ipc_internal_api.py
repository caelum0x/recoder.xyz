"""Tests for the internal API guard: health gate, service key, signed envelope."""

import pytest

from recoder_billing.config.settings import load_settings
from recoder_billing.ipc.envelope import sign_envelope
from recoder_billing.ipc.internal_api import (
    AuthorizationError,
    InternalApiGuard,
)

_ENV = {
    "RECODER_BILLING_ENV": "production",
    "SECRET": "jwt-secret",
    "INTERNAL_SERVICE_KEY": "the-service-key",
    "BILLING_ENVELOPE_SIGNING_KEY": "env-key",
    "POLAR_ACCESS_TOKEN": "polar_pat",
    "BILLING_TOKEN_HASH_SECRET": "hash",
    "AUTH_SOURCE_OF_TRUTH_URL": "https://recoder.xyz",
    "BILLING_BASE_URL": "https://billing.recoder.xyz",
}


def _healthy_guard() -> InternalApiGuard:
    return InternalApiGuard(load_settings(dict(_ENV)))


def _envelope_wire(nonce="n-1"):
    return sign_envelope(
        caller="recoder/distribution",
        operation="entitlement.resolve",
        payload={"customer_id": "c-1"},
        signing_key="env-key",
        nonce=nonce,
    ).to_wire()


@pytest.mark.unit
def test_health_ok_when_configured():
    report = _healthy_guard().health()
    assert report["status"] == "ok"
    assert report["healthy"] is True
    assert report["issues"] == []


@pytest.mark.unit
def test_health_unhealthy_when_secret_missing():
    guard = InternalApiGuard(load_settings({"RECODER_BILLING_ENV": "production"}))
    report = guard.health()
    assert report["status"] == "unhealthy"
    assert report["healthy"] is False
    assert len(report["issues"]) > 0


@pytest.mark.unit
def test_authorize_happy_path():
    guard = _healthy_guard()
    call = guard.authorize(
        service_key_header="the-service-key",
        envelope_wire=_envelope_wire(),
    )
    assert call.caller == "recoder/distribution"
    assert call.operation == "entitlement.resolve"
    assert call.payload == {"customer_id": "c-1"}


@pytest.mark.unit
def test_unhealthy_engine_denies_everything():
    guard = InternalApiGuard(load_settings({"RECODER_BILLING_ENV": "production"}))
    with pytest.raises(AuthorizationError) as exc:
        guard.authorize(
            service_key_header="anything", envelope_wire=_envelope_wire()
        )
    assert exc.value.reason == "unhealthy"
    assert exc.value.status_code == 503


@pytest.mark.unit
def test_invalid_service_key_denied():
    guard = _healthy_guard()
    with pytest.raises(AuthorizationError) as exc:
        guard.authorize(
            service_key_header="wrong-key", envelope_wire=_envelope_wire()
        )
    assert exc.value.reason == "invalid_service_key"
    assert exc.value.status_code == 401


@pytest.mark.unit
def test_missing_service_key_denied():
    guard = _healthy_guard()
    with pytest.raises(AuthorizationError) as exc:
        guard.authorize(service_key_header=None, envelope_wire=_envelope_wire())
    assert exc.value.reason == "invalid_service_key"


@pytest.mark.unit
def test_replayed_envelope_denied_on_second_use():
    guard = _healthy_guard()
    wire = _envelope_wire(nonce="reused")
    guard.authorize(service_key_header="the-service-key", envelope_wire=wire)
    with pytest.raises(AuthorizationError) as exc:
        guard.authorize(service_key_header="the-service-key", envelope_wire=wire)
    assert exc.value.reason == "replayed_nonce"


@pytest.mark.unit
def test_tampered_envelope_denied():
    guard = _healthy_guard()
    wire = _envelope_wire()
    wire["payload"] = {"customer_id": "evil"}
    with pytest.raises(AuthorizationError) as exc:
        guard.authorize(service_key_header="the-service-key", envelope_wire=wire)
    assert exc.value.reason == "bad_mac"
