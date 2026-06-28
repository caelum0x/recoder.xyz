"""Settings for recoder-billing. Merged from polar/config.py and reshaped for Recoder.

Hard rules enforced here (distribution.md / AGENTS.md / production.md):

* **Secrets come from env only.** Unlike upstream Polar, there is NO baked-in default
  for ``SECRET`` / ``INTERNAL_SERVICE_KEY`` / signing keys. A missing secret yields an
  explicit ``unhealthy`` health state and a deny — never a faked "ok"/allow.
* **No hardcoded localhost/domains in production paths.** Public URLs (the
  ``recoder.xyz`` auth source of truth, the billing host) come from env. In
  non-production envs a localhost default is allowed for local dev only and is rejected
  if it leaks into production.
* ``recoder.xyz`` is the auth source of truth: device-flow tokens verify against
  ``AUTH_SOURCE_OF_TRUTH_URL``, never a second authority.

This module is intentionally dependency-light (stdlib + os.environ) so the spine has no
pydantic-settings requirement; the full FastAPI fusion can layer richer validation on top.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import StrEnum
from functools import lru_cache
from urllib.parse import urlparse


class Environment(StrEnum):
    development = "development"
    testing = "testing"
    sandbox = "sandbox"
    production = "production"


_LOCALHOST_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _is_localhost(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return False
    return host in _LOCALHOST_HOSTS


@dataclass(frozen=True)
class HealthIssue:
    """A single truthful reason the billing engine is not fully healthy."""

    key: str
    message: str


@dataclass(frozen=True)
class Settings:
    """Resolved billing settings. Build via :func:`get_settings` (reads env once)."""

    env: Environment

    # Secrets — env only, no defaults. Empty means "absent" (fail safe).
    secret: str  # signing secret for billing-minted JWTs (HS256)
    internal_service_key: str  # guards /internal/agent-os/billing/*
    envelope_signing_key: str  # HMAC key for signed IPC envelopes
    polar_access_token: str  # Polar Merchant-of-Record API token
    token_hash_secret: str  # HMAC key for hashing persisted tokens

    # URLs — recoder.xyz is the auth source of truth.
    auth_source_of_truth_url: str  # e.g. https://recoder.xyz
    billing_base_url: str  # public base URL for this service

    # Webhook signing secret for inbound Polar webhooks (never trust the wire).
    polar_webhook_secret: str = ""

    # Token lifetimes (no secrets; safe defaults).
    cli_access_token_ttl_seconds: int = 60 * 60  # 1h
    cli_refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 30d
    internal_envelope_ttl_seconds: int = 60 * 5  # 5m

    # Non-secret config issues collected at build time.
    config_issues: tuple[HealthIssue, ...] = field(default_factory=tuple)

    @property
    def is_production(self) -> bool:
        return self.env == Environment.production

    def missing_secrets(self) -> list[HealthIssue]:
        """Return the list of required-but-absent secrets/URLs (truthful health)."""
        issues: list[HealthIssue] = []
        required = {
            "SECRET": self.secret,
            "INTERNAL_SERVICE_KEY": self.internal_service_key,
            "BILLING_ENVELOPE_SIGNING_KEY": self.envelope_signing_key,
            "POLAR_ACCESS_TOKEN": self.polar_access_token,
            "BILLING_TOKEN_HASH_SECRET": self.token_hash_secret,
            "AUTH_SOURCE_OF_TRUTH_URL": self.auth_source_of_truth_url,
        }
        for key, value in required.items():
            if not value:
                issues.append(HealthIssue(key=key, message=f"{key} is not set (env-only)."))
        return issues

    def health_issues(self) -> list[HealthIssue]:
        """All issues: missing secrets + non-secret config problems."""
        return [*self.missing_secrets(), *self.config_issues]

    def is_healthy(self) -> bool:
        """True only when every required secret/URL is present and config is valid.

        A False here means the engine must DENY billing/entitlement operations — never
        fake an allow.
        """
        return len(self.health_issues()) == 0


def _build_config_issues(env: Environment, settings_kwargs: dict[str, str]) -> tuple[HealthIssue, ...]:
    issues: list[HealthIssue] = []
    if env == Environment.production:
        for key in ("auth_source_of_truth_url", "billing_base_url"):
            url = settings_kwargs.get(key, "")
            if url and _is_localhost(url):
                env_name = {
                    "auth_source_of_truth_url": "AUTH_SOURCE_OF_TRUTH_URL",
                    "billing_base_url": "BILLING_BASE_URL",
                }[key]
                issues.append(
                    HealthIssue(
                        key=env_name,
                        message=f"{env_name} must not be a localhost URL in production.",
                    )
                )
    return tuple(issues)


def load_settings(environ: dict[str, str] | None = None) -> Settings:
    """Build :class:`Settings` from a mapping (defaults to ``os.environ``).

    Pure and side-effect-free given an explicit mapping — used directly in tests.
    """
    src = os.environ if environ is None else environ
    env = Environment(src.get("RECODER_BILLING_ENV", Environment.development))

    kwargs = {
        "secret": src.get("SECRET", ""),
        "internal_service_key": src.get("INTERNAL_SERVICE_KEY", ""),
        "envelope_signing_key": src.get("BILLING_ENVELOPE_SIGNING_KEY", ""),
        "polar_access_token": src.get("POLAR_ACCESS_TOKEN", ""),
        "token_hash_secret": src.get("BILLING_TOKEN_HASH_SECRET", ""),
        "polar_webhook_secret": src.get("POLAR_WEBHOOK_SECRET", ""),
        "auth_source_of_truth_url": src.get("AUTH_SOURCE_OF_TRUTH_URL", ""),
        "billing_base_url": src.get("BILLING_BASE_URL", ""),
    }

    return Settings(
        env=env,
        config_issues=_build_config_issues(env, kwargs),
        **kwargs,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings, read from ``os.environ`` once. Clear cache in tests."""
    return load_settings()
