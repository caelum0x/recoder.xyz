"""Tests for the signed envelope: sign/verify, tamper, replay, freshness, fail-safe."""

import time

import pytest

from recoder_billing.ipc.envelope import (
    EnvelopeVerificationError,
    parse_envelope,
    sign_envelope,
    verify_envelope,
)

KEY = "envelope-signing-key"


def _sign(**overrides):
    base = dict(
        caller="recoder/distribution",
        operation="entitlement.resolve",
        payload={"customer_id": "c-1"},
        signing_key=KEY,
        nonce="nonce-1",
    )
    base.update(overrides)
    return sign_envelope(**base)


@pytest.mark.unit
def test_sign_then_verify_ok():
    env = _sign()
    # Should not raise.
    verify_envelope(env, signing_key=KEY)


@pytest.mark.unit
def test_round_trip_through_wire():
    env = _sign()
    parsed = parse_envelope(env.to_wire())
    verify_envelope(parsed, signing_key=KEY)
    assert parsed.payload == {"customer_id": "c-1"}


@pytest.mark.unit
def test_tampered_payload_fails_mac():
    env = _sign()
    tampered = parse_envelope({**env.to_wire(), "payload": {"customer_id": "c-2"}})
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(tampered, signing_key=KEY)
    assert exc.value.reason == "bad_mac"


@pytest.mark.unit
def test_wrong_key_fails():
    env = _sign()
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(env, signing_key="other-key")
    assert exc.value.reason == "bad_mac"


@pytest.mark.unit
def test_missing_signing_key_denies_fail_safe():
    env = _sign()
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(env, signing_key="")
    assert exc.value.reason == "missing_signing_key"
    # Signing with no key is refused too.
    with pytest.raises(EnvelopeVerificationError):
        sign_envelope(
            caller="x", operation="y", payload={}, signing_key="", nonce="n"
        )


@pytest.mark.unit
def test_replayed_nonce_rejected():
    env = _sign()
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(env, signing_key=KEY, seen_nonce=True)
    assert exc.value.reason == "replayed_nonce"


@pytest.mark.unit
def test_stale_envelope_rejected():
    old_ts = int(time.time() * 1000) - (10 * 60 * 1000)  # 10 min ago
    env = _sign(timestamp_ms=old_ts)
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(env, signing_key=KEY)
    assert exc.value.reason == "stale"


@pytest.mark.unit
def test_future_dated_envelope_rejected():
    future_ts = int(time.time() * 1000) + (10 * 60 * 1000)
    env = _sign(timestamp_ms=future_ts)
    with pytest.raises(EnvelopeVerificationError) as exc:
        verify_envelope(env, signing_key=KEY)
    assert exc.value.reason == "future_dated"


@pytest.mark.unit
def test_malformed_envelope_rejected():
    with pytest.raises(EnvelopeVerificationError) as exc:
        parse_envelope({"caller": "x"})
    assert exc.value.reason == "malformed"
