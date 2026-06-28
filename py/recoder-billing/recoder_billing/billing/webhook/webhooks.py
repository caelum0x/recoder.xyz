"""Webhook signing + verification. Fused from polar/webhook/tasks.py signing path, owned.

Polar signed outbound webhooks with the ``standardwebhooks`` library (the Svix scheme) and
shipped svix-style ``webhook-id`` / ``webhook-timestamp`` / ``webhook-signature`` headers.
We own that scheme directly here — it is a small, well-specified HMAC construction, and
owning it removes the third-party dependency while staying wire-compatible with every
``standardwebhooks`` / Svix consumer:

- the signing secret is base64-decoded (Polar base64-encodes the stored endpoint secret
  before handing it to ``StandardWebhook``; we accept either a ``whsec_``-prefixed or raw
  base64 secret);
- the signed content is ``f"{msg_id}.{timestamp}.{payload}"``;
- the signature is ``v1,<base64(HMAC-SHA256)>``; multiple space-separated signatures are
  supported on verify (key rotation).

Verification is constant-time and enforces a timestamp tolerance, exactly as the inbound
side of the standard requires.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass

from ...kit.crypto import constant_time_compare

SECRET_PREFIX = "whsec_"
DEFAULT_TOLERANCE_SECONDS = 5 * 60  # Svix default: 5 minutes.

WEBHOOK_ID_HEADER = "webhook-id"
WEBHOOK_TIMESTAMP_HEADER = "webhook-timestamp"
WEBHOOK_SIGNATURE_HEADER = "webhook-signature"


class WebhookSignatureError(Exception):
    """Raised when an inbound webhook signature fails verification."""

    def __init__(self, reason: str, message: str | None = None) -> None:
        super().__init__(message or reason)
        self.reason = reason


@dataclass(frozen=True)
class SignedWebhook:
    """The svix-style headers to attach to an outbound webhook request."""

    id: str
    timestamp: int
    signature: str

    def headers(self, *, user_agent: str = "recoder webhooks") -> dict[str, str]:
        """The full header set for the HTTP delivery (content-type + signature triple)."""
        return {
            "user-agent": user_agent,
            "content-type": "application/json",
            WEBHOOK_ID_HEADER: self.id,
            WEBHOOK_TIMESTAMP_HEADER: str(self.timestamp),
            WEBHOOK_SIGNATURE_HEADER: self.signature,
        }


def _decode_secret(secret: str) -> bytes:
    """Decode a signing secret to raw bytes.

    Accepts a ``whsec_``-prefixed base64 secret (the standardwebhooks convention) or a
    bare base64 secret. Falls back to the raw UTF-8 bytes if the value is not valid
    base64, matching the lenient behavior of the standard's reference implementations.
    """
    value = secret[len(SECRET_PREFIX) :] if secret.startswith(SECRET_PREFIX) else secret
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, base64.binascii.Error):  # type: ignore[attr-defined]
        return secret.encode("utf-8")


def _compute_signature(secret_bytes: bytes, msg_id: str, timestamp: int, payload: str) -> str:
    """The base64 HMAC-SHA256 over ``"{id}.{timestamp}.{payload}"``."""
    to_sign = f"{msg_id}.{timestamp}.{payload}".encode("utf-8")
    digest = hmac.new(secret_bytes, to_sign, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def sign_webhook(
    *, secret: str, msg_id: str, timestamp: int, payload: str
) -> SignedWebhook:
    """Sign an outbound webhook payload. Fused from Polar's ``StandardWebhook.sign`` use.

    ``payload`` is the exact JSON body that will be sent (signing and sending must use the
    identical bytes). Returns the svix-style ``v1,<sig>`` signature plus the id/timestamp.
    """
    signature = _compute_signature(_decode_secret(secret), msg_id, timestamp, payload)
    return SignedWebhook(id=msg_id, timestamp=timestamp, signature=f"v1,{signature}")


def verify_webhook(
    *,
    secret: str,
    payload: str,
    msg_id: str,
    timestamp: int,
    signature_header: str,
    now: int,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
) -> None:
    """Verify an inbound webhook. Raises :class:`WebhookSignatureError` on failure.

    Enforces the timestamp tolerance window (replay/old-message protection), recomputes the
    expected signature, and constant-time-compares it against each space-separated
    signature in ``signature_header`` (supporting multiple signatures during key rotation).
    Owned counterpart to the outbound :func:`sign_webhook`; symmetric with the standard so
    any Svix-signed sender verifies here and vice versa.
    """
    if abs(now - timestamp) > tolerance_seconds:
        raise WebhookSignatureError(
            "timestamp_out_of_tolerance",
            "Webhook timestamp is outside the allowed tolerance window.",
        )

    expected = _compute_signature(_decode_secret(secret), msg_id, timestamp, payload)

    for part in signature_header.split(" "):
        part = part.strip()
        if not part:
            continue
        # Each part is "version,signature"; we only support v1 (HMAC-SHA256 base64).
        version, _, candidate = part.partition(",")
        if version != "v1" or not candidate:
            continue
        if constant_time_compare(candidate, expected):
            return

    raise WebhookSignatureError(
        "no_matching_signature", "No signature in the header matched."
    )


__all__ = [
    "DEFAULT_TOLERANCE_SECONDS",
    "SECRET_PREFIX",
    "SignedWebhook",
    "WEBHOOK_ID_HEADER",
    "WEBHOOK_SIGNATURE_HEADER",
    "WEBHOOK_TIMESTAMP_HEADER",
    "WebhookSignatureError",
    "sign_webhook",
    "verify_webhook",
]
