"""Token + HMAC primitives. Fused from polar/kit/crypto.py.

High-entropy token generation with a CRC32/base62 checksum, plus HMAC-SHA256
hashing so only the hash is ever persisted. Used for license keys, CLI tokens,
and internal API tokens.
"""

import hashlib
import hmac
import secrets
import string
import zlib

_BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def _crc32_to_base62(number: int) -> str:
    base = len(_BASE62_ALPHABET)
    encoded = ""
    while number:
        number, remainder = divmod(number, base)
        encoded = _BASE62_ALPHABET[remainder] + encoded
    return encoded.zfill(6)  # Ensure the checksum is 6 characters long


def get_token_hash(token: str, *, secret: str) -> str:
    """HMAC-SHA256 of a token. Only this value should ever be stored in a database."""
    if not secret:
        raise ValueError("Token-hash secret is required; refusing to hash with an empty key.")
    digest = hmac.new(secret.encode("ascii"), token.encode("ascii"), hashlib.sha256)
    return digest.hexdigest()


def generate_token(*, prefix: str = "") -> str:
    """Generate a high-entropy random token with a trailing CRC32/base62 checksum."""
    token = "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(37)
    )
    checksum = zlib.crc32(token.encode("utf-8")) & 0xFFFFFFFF
    checksum_base62 = _crc32_to_base62(checksum)
    return f"{prefix}{token}{checksum_base62}"


def generate_token_hash_pair(*, secret: str, prefix: str = "") -> tuple[str, str]:
    """Generate a sensitive token and its HMAC-SHA256 hash.

    Returns ``(token, token_hash)``. Hand the token to the client once; persist only
    the hash.
    """
    token = generate_token(prefix=prefix)
    return token, get_token_hash(token, secret=secret)


def constant_time_compare(a: str, b: str) -> bool:
    """Timing-safe string comparison for secret material (envelope MACs, API keys)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
