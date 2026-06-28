"""Signed envelope verification. Per distribution.md §3.9 — never trust the wire.

Every call into ``/internal/agent-os/billing/*`` carries a signed envelope. The
envelope binds: the caller identity, the target operation, the JSON payload, a
millisecond timestamp, and a single-use nonce, sealed with an HMAC-SHA256 MAC over a
canonical byte string. Verification rejects:

* a missing/empty signing key (fail safe — deny, never a faked allow),
* a tampered payload/operation/caller (MAC mismatch),
* a stale or future-dated envelope (replay window),
* a malformed envelope.

This is deliberately framework-free so it can be unit-tested without FastAPI/DB.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any

# Maximum age of an envelope before it is rejected as stale (replay protection).
DEFAULT_MAX_AGE_MS = 5 * 60 * 1000  # 5 minutes
# Allowance for minor clock skew between caller and this service.
DEFAULT_CLOCK_SKEW_MS = 30 * 1000  # 30 seconds

_MAC_VERSION = "v1"


class EnvelopeVerificationError(Exception):
    """Raised when an envelope fails verification. Carries a stable ``reason`` code."""

    def __init__(self, reason: str, message: str | None = None) -> None:
        super().__init__(message or reason)
        self.reason = reason


@dataclass(frozen=True)
class Envelope:
    """A signed request envelope. The MAC seals every other field."""

    caller: str  # signed caller identity (e.g. "recoder/distribution")
    operation: str  # the internal billing operation being invoked
    payload: dict[str, Any]  # the operation arguments
    timestamp_ms: int  # caller-side mint time in epoch milliseconds
    nonce: str  # single-use anti-replay nonce
    mac: str  # hex HMAC-SHA256 over the canonical message

    def to_wire(self) -> dict[str, Any]:
        return {
            "caller": self.caller,
            "operation": self.operation,
            "payload": self.payload,
            "timestamp_ms": self.timestamp_ms,
            "nonce": self.nonce,
            "mac": self.mac,
        }


def _canonical_message(
    *, caller: str, operation: str, payload: dict[str, Any], timestamp_ms: int, nonce: str
) -> bytes:
    """Deterministic byte string the MAC is computed over.

    ``sort_keys`` + compact separators make the encoding stable across callers, so an
    identical logical envelope always produces an identical MAC.
    """
    canonical = json.dumps(
        {
            "v": _MAC_VERSION,
            "caller": caller,
            "operation": operation,
            "payload": payload,
            "timestamp_ms": timestamp_ms,
            "nonce": nonce,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return canonical.encode("utf-8")


def _compute_mac(message: bytes, *, signing_key: str) -> str:
    return hmac.new(signing_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def sign_envelope(
    *,
    caller: str,
    operation: str,
    payload: dict[str, Any],
    signing_key: str,
    nonce: str,
    timestamp_ms: int | None = None,
) -> Envelope:
    """Build a signed envelope. Used by the distribution client (and by tests).

    A missing signing key raises immediately — we never emit an unsigned envelope.
    """
    if not signing_key:
        raise EnvelopeVerificationError(
            "missing_signing_key", "Refusing to sign with an empty signing key."
        )
    ts = int(time.time() * 1000) if timestamp_ms is None else timestamp_ms
    message = _canonical_message(
        caller=caller, operation=operation, payload=payload, timestamp_ms=ts, nonce=nonce
    )
    mac = _compute_mac(message, signing_key=signing_key)
    return Envelope(
        caller=caller,
        operation=operation,
        payload=payload,
        timestamp_ms=ts,
        nonce=nonce,
        mac=mac,
    )


def parse_envelope(data: dict[str, Any]) -> Envelope:
    """Parse a wire dict into an :class:`Envelope`, validating shape. Never trust the wire."""
    required = ("caller", "operation", "payload", "timestamp_ms", "nonce", "mac")
    for key in required:
        if key not in data:
            raise EnvelopeVerificationError("malformed", f"Envelope missing field '{key}'.")
    if not isinstance(data["payload"], dict):
        raise EnvelopeVerificationError("malformed", "Envelope 'payload' must be an object.")
    if not isinstance(data["timestamp_ms"], int) or isinstance(data["timestamp_ms"], bool):
        raise EnvelopeVerificationError("malformed", "Envelope 'timestamp_ms' must be an integer.")
    for key in ("caller", "operation", "nonce", "mac"):
        if not isinstance(data[key], str) or not data[key]:
            raise EnvelopeVerificationError("malformed", f"Envelope '{key}' must be a non-empty string.")
    return Envelope(
        caller=data["caller"],
        operation=data["operation"],
        payload=data["payload"],
        timestamp_ms=data["timestamp_ms"],
        nonce=data["nonce"],
        mac=data["mac"],
    )


def verify_envelope(
    envelope: Envelope,
    *,
    signing_key: str,
    now_ms: int | None = None,
    max_age_ms: int = DEFAULT_MAX_AGE_MS,
    clock_skew_ms: int = DEFAULT_CLOCK_SKEW_MS,
    seen_nonce: bool = False,
) -> None:
    """Verify an envelope or raise :class:`EnvelopeVerificationError`.

    Fail-safe order: missing key -> replayed nonce -> MAC -> freshness. A missing
    signing key always denies (never a faked allow). The caller is responsible for
    nonce bookkeeping and passes ``seen_nonce=True`` if this nonce was already used.
    """
    if not signing_key:
        raise EnvelopeVerificationError(
            "missing_signing_key",
            "Billing envelope signing key is not configured; denying.",
        )

    if seen_nonce:
        raise EnvelopeVerificationError("replayed_nonce", "Envelope nonce has already been used.")

    message = _canonical_message(
        caller=envelope.caller,
        operation=envelope.operation,
        payload=envelope.payload,
        timestamp_ms=envelope.timestamp_ms,
        nonce=envelope.nonce,
    )
    expected = _compute_mac(message, signing_key=signing_key)
    if not hmac.compare_digest(expected, envelope.mac):
        raise EnvelopeVerificationError("bad_mac", "Envelope MAC verification failed.")

    current = int(time.time() * 1000) if now_ms is None else now_ms
    age = current - envelope.timestamp_ms
    if age > max_age_ms:
        raise EnvelopeVerificationError("stale", "Envelope is too old (possible replay).")
    if age < -clock_skew_ms:
        raise EnvelopeVerificationError("future_dated", "Envelope timestamp is in the future.")
