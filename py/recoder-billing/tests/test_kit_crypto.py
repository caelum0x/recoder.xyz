"""Tests for recoder_billing.kit.crypto — token generation + HMAC hashing."""

import pytest

from recoder_billing.kit import crypto


@pytest.mark.unit
def test_generate_token_has_prefix_and_checksum_length():
    token = crypto.generate_token(prefix="rb_")
    assert token.startswith("rb_")
    # 37 random chars + 6 checksum chars after the prefix.
    assert len(token) == len("rb_") + 37 + 6


@pytest.mark.unit
def test_generate_token_is_high_entropy_unique():
    tokens = {crypto.generate_token() for _ in range(1000)}
    assert len(tokens) == 1000


@pytest.mark.unit
def test_token_hash_is_stable_and_keyed():
    token = "some-token-value"
    h1 = crypto.get_token_hash(token, secret="key-a")
    h2 = crypto.get_token_hash(token, secret="key-a")
    h3 = crypto.get_token_hash(token, secret="key-b")
    assert h1 == h2
    assert h1 != h3
    # HMAC-SHA256 hex digest is 64 chars.
    assert len(h1) == 64


@pytest.mark.unit
def test_token_hash_pair_round_trips():
    token, token_hash = crypto.generate_token_hash_pair(secret="secret", prefix="lk_")
    assert token.startswith("lk_")
    assert crypto.get_token_hash(token, secret="secret") == token_hash


@pytest.mark.unit
def test_empty_secret_is_rejected_fail_safe():
    with pytest.raises(ValueError):
        crypto.get_token_hash("x", secret="")


@pytest.mark.unit
def test_constant_time_compare():
    assert crypto.constant_time_compare("abc", "abc") is True
    assert crypto.constant_time_compare("abc", "abd") is False
