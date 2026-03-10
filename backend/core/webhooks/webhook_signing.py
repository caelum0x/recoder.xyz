"""
Webhook HMAC signing and verification utilities.

Provides functions for generating signing secrets, creating HMAC-SHA256
signatures for webhook payloads, and verifying signatures with
constant-time comparison.
"""

import hashlib
import hmac
import secrets
import time


def generate_webhook_secret() -> str:
    """Generate a random 32-byte hex signing secret."""
    return secrets.token_hex(32)


def sign_payload(payload: str, secret: str, timestamp: str | None = None) -> tuple[str, str]:
    """
    Sign a webhook payload with HMAC-SHA256.

    Args:
        payload: The JSON body string to sign.
        secret: The webhook signing secret.
        timestamp: Optional Unix timestamp string. If None, current time is used.

    Returns:
        A tuple of (signature_hex, timestamp_str).
        The signed message is: "{timestamp}.{payload}"
    """
    if timestamp is None:
        timestamp = str(int(time.time()))

    signed_content = f"{timestamp}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"),
        signed_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return signature, timestamp


def verify_signature(payload: str, signature: str, secret: str, timestamp: str) -> bool:
    """
    Verify a webhook signature using constant-time comparison.

    Args:
        payload: The raw JSON body string.
        signature: The signature to verify (hex string, without 'sha256=' prefix).
        secret: The webhook signing secret.
        timestamp: The timestamp used during signing.

    Returns:
        True if the signature is valid, False otherwise.
    """
    signed_content = f"{timestamp}.{payload}"
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
