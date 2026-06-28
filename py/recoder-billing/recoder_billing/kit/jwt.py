"""JWT encode/decode primitive. Fused from polar/kit/jwt.py.

Reshaped for Recoder: the token ``type`` taxonomy is Recoder's distribution surface
(device-flow + internal envelope tokens), not Polar's OAuth provider list. Decoding
always verifies the declared type, so a token minted for one purpose can never be
replayed for another.
"""

from datetime import datetime, timedelta
from typing import Any, Literal

import jwt

from .utils import utc_now

DEFAULT_EXPIRATION = 60 * 15  # 15 minutes
ALGORITHM = "HS256"

DecodeError = jwt.DecodeError
ExpiredSignatureError = jwt.ExpiredSignatureError


class InvalidTokenTypeError(DecodeError):
    """Raised when a token's declared ``type`` does not match the expected type."""


def create_expiration_dt(seconds: int) -> datetime:
    return utc_now() + timedelta(seconds=seconds)


# Recoder distribution token taxonomy (de-Polar-branded). Each value names a
# distinct purpose so tokens are non-fungible across surfaces.
TokenType = Literal[
    "cli_device_grant",  # device-flow user_code/device_code grant
    "cli_access",  # minted CLI access token (verified vs recoder.xyz)
    "cli_refresh",  # CLI refresh token
    "internal_envelope",  # signed internal IPC envelope claim
    "customer_session",  # customer portal session
    "auth",  # generic auth claim
]


def encode(
    *,
    data: dict[str, Any],
    secret: str,
    type: TokenType,
    expires_at: datetime | None = None,
    expires_in: int | None = DEFAULT_EXPIRATION,
) -> str:
    """Encode a typed, expiring JWT.

    The ``type`` is always embedded and re-checked on decode; an empty/falsy secret
    is rejected so a missing signing key can never silently produce an unsigned token.
    """
    if not secret:
        raise ValueError("JWT signing secret is required; refusing to mint an unsigned token.")

    to_encode = data.copy()
    to_encode["type"] = type

    if not expires_at:
        expires_in = expires_in or DEFAULT_EXPIRATION
        expires_at = create_expiration_dt(seconds=expires_in)

    to_encode["exp"] = expires_at
    return jwt.encode(to_encode, secret, algorithm=ALGORITHM)


def decode_unsafe(*, token: str, secret: str) -> dict[str, Any]:
    """Decode + verify signature/expiry, WITHOUT checking the token ``type``.

    "unsafe" only in the sense that the caller must still validate ``type`` itself.
    """
    if not secret:
        raise ValueError("JWT verification secret is required; refusing to verify against an empty key.")
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def decode(*, token: str, secret: str, type: TokenType) -> dict[str, Any]:
    """Decode, verify signature/expiry, AND enforce the expected token ``type``."""
    res = decode_unsafe(token=token, secret=secret)

    token_type = res.get("type", "")
    if token_type != type:
        raise InvalidTokenTypeError(
            f"JWT of unexpected type, expected '{type}' got '{token_type}'"
        )

    return res
