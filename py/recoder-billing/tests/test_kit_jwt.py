"""Tests for recoder_billing.kit.jwt — typed, expiring JWT round-trip."""

from datetime import timedelta

import pytest

from recoder_billing.kit import jwt as rbjwt
from recoder_billing.kit.utils import utc_now


@pytest.mark.unit
def test_encode_decode_round_trip():
    token = rbjwt.encode(
        data={"sub": "user-123", "plan": "pro"},
        secret="signing-secret",
        type="cli_access",
    )
    decoded = rbjwt.decode(token=token, secret="signing-secret", type="cli_access")
    assert decoded["sub"] == "user-123"
    assert decoded["plan"] == "pro"
    assert decoded["type"] == "cli_access"


@pytest.mark.unit
def test_type_mismatch_is_rejected():
    token = rbjwt.encode(data={}, secret="s", type="cli_access")
    with pytest.raises(rbjwt.InvalidTokenTypeError):
        rbjwt.decode(token=token, secret="s", type="cli_refresh")


@pytest.mark.unit
def test_wrong_secret_fails_signature():
    token = rbjwt.encode(data={}, secret="right", type="auth")
    with pytest.raises(rbjwt.DecodeError):
        rbjwt.decode(token=token, secret="wrong", type="auth")


@pytest.mark.unit
def test_expired_token_rejected():
    token = rbjwt.encode(
        data={},
        secret="s",
        type="internal_envelope",
        expires_at=utc_now() - timedelta(seconds=1),
    )
    with pytest.raises(rbjwt.ExpiredSignatureError):
        rbjwt.decode(token=token, secret="s", type="internal_envelope")


@pytest.mark.unit
def test_empty_secret_refused_on_encode_and_decode():
    with pytest.raises(ValueError):
        rbjwt.encode(data={}, secret="", type="auth")
    with pytest.raises(ValueError):
        rbjwt.decode_unsafe(token="x", secret="")
