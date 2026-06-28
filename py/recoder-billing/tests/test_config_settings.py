"""Tests for recoder_billing.config.settings — env-only, fail-safe."""

import pytest

from recoder_billing.config.settings import Environment, load_settings

_FULL_ENV = {
    "RECODER_BILLING_ENV": "production",
    "SECRET": "jwt-secret",
    "INTERNAL_SERVICE_KEY": "isk",
    "BILLING_ENVELOPE_SIGNING_KEY": "env-key",
    "POLAR_ACCESS_TOKEN": "polar_pat_x",
    "BILLING_TOKEN_HASH_SECRET": "hash-secret",
    "AUTH_SOURCE_OF_TRUTH_URL": "https://recoder.xyz",
    "BILLING_BASE_URL": "https://billing.recoder.xyz",
}


@pytest.mark.unit
def test_fully_configured_is_healthy():
    settings = load_settings(dict(_FULL_ENV))
    assert settings.is_production
    assert settings.is_healthy()
    assert settings.health_issues() == []


@pytest.mark.unit
def test_missing_secrets_are_reported_and_deny():
    settings = load_settings({"RECODER_BILLING_ENV": "production"})
    assert not settings.is_healthy()
    keys = {issue.key for issue in settings.missing_secrets()}
    assert "SECRET" in keys
    assert "INTERNAL_SERVICE_KEY" in keys
    assert "POLAR_ACCESS_TOKEN" in keys
    assert "BILLING_ENVELOPE_SIGNING_KEY" in keys
    assert "AUTH_SOURCE_OF_TRUTH_URL" in keys


@pytest.mark.unit
def test_no_baked_in_secret_defaults():
    # Unlike upstream Polar, there is NO default SECRET — absent means empty.
    settings = load_settings({})
    assert settings.secret == ""
    assert settings.internal_service_key == ""


@pytest.mark.unit
def test_localhost_url_rejected_in_production():
    env = dict(_FULL_ENV)
    env["AUTH_SOURCE_OF_TRUTH_URL"] = "http://localhost:3000"
    settings = load_settings(env)
    assert not settings.is_healthy()
    keys = {issue.key for issue in settings.health_issues()}
    assert "AUTH_SOURCE_OF_TRUTH_URL" in keys


@pytest.mark.unit
def test_localhost_url_allowed_in_development():
    env = dict(_FULL_ENV)
    env["RECODER_BILLING_ENV"] = "development"
    env["AUTH_SOURCE_OF_TRUTH_URL"] = "http://localhost:3000"
    env["BILLING_BASE_URL"] = "http://localhost:8000"
    settings = load_settings(env)
    assert settings.env == Environment.development
    # Localhost is fine outside production; all secrets present -> healthy.
    assert settings.is_healthy()
