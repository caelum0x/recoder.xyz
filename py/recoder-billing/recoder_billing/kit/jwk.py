"""JWKS file loading + dev key generation. Fused from polar/kit/jwk.py.

Reshaped for Recoder: the JWKS path is validated fail-safe (a missing/invalid file
raises an explicit error instead of silently degrading to no key material). The
``authlib`` dependency is imported lazily so this module imports cleanly in the pure
spine; key operations require ``authlib`` to be installed.
"""

import pathlib
from typing import Any

TIP_MESSAGE = (
    "Provide a valid JWKS file via the JWKS env var. In local development you can "
    "generate one with: python -m recoder_billing.kit.jwk <kid>"
)


def _require_authlib() -> Any:
    try:
        from authlib.jose import JsonWebKey  # type: ignore

        return JsonWebKey
    except ImportError as e:  # pragma: no cover - exercised only without authlib
        raise RuntimeError(
            "authlib is required for JWKS operations. Install the 'api' extra: "
            "pip install 'recoder-billing[api]'."
        ) from e


def generate_jwks(kid: str, size: int = 2048) -> str:
    """Generate a fresh RSA JWKS (private) as JSON. For local/dev key bootstrap only."""
    JsonWebKey = _require_authlib()
    from authlib.jose import KeySet  # type: ignore

    options = {"kid": kid, "use": "sig"}
    key = JsonWebKey.generate_key("RSA", size, options, is_private=True)
    keyset = KeySet(keys=[key])
    return keyset.as_json(is_private=True)


def load_jwks(path: str | pathlib.Path) -> Any:
    """Load and validate a JWKS file, failing safe with an explicit error.

    Returns an authlib ``KeySet``. A missing or malformed file raises ``ValueError``
    rather than returning empty key material — a missing signing key must surface as
    unhealthy, never as a silent allow.
    """
    JsonWebKey = _require_authlib()

    p = pathlib.Path(str(path))
    if not p.exists() or not p.is_file():
        raise ValueError(
            f"The provided JWKS path {path} is not a valid file path "
            f"or does not exist.\n{TIP_MESSAGE}"
        )

    try:
        content = p.read_text(encoding="utf-8").strip()
        return JsonWebKey.import_key_set(content)
    except ValueError as e:
        raise ValueError(
            f"The provided JWKS file {path} is not a valid JWKS file.\n{TIP_MESSAGE}"
        ) from e


if __name__ == "__main__":  # pragma: no cover - CLI bootstrap helper
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Generate a dev JWKS")
    parser.add_argument("kid", type=str, help="Key ID")
    parser.add_argument("--size", type=int, default=2048, help="Key size (default: 2048)")
    args = parser.parse_args()

    sys.stdout.write(generate_jwks(args.kid, args.size))
    sys.stdout.write("\n")
