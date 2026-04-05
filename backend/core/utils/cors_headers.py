from __future__ import annotations

import re
from typing import Dict, Optional

from fastapi import Request

from core.utils.config import EnvMode

BASE_ALLOWED_ORIGINS = [
    "https://www.recoder.xyz",
    "https://recoder.xyz",
    "https://dev.recoder.xyz",
    "https://staging.recoder.xyz",
    "https://prod-test.recoder.xyz",
]

ALLOW_ORIGIN_REGEX = re.compile(
    r"^https://([a-z0-9-]+\.)?recoder\.xyz$|^https://.*-recoderxyz\.vercel\.app$"
)

EXPOSED_CORS_HEADERS = "X-Trace-Id, X-Request-Id, X-Connector-Id, X-Interop-Metadata"


def build_allowed_origins(env_mode: Optional[EnvMode]) -> list[str]:
    origins = list(BASE_ALLOWED_ORIGINS)

    if env_mode == EnvMode.LOCAL:
        origins.extend([
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ])

    if env_mode == EnvMode.STAGING:
        origins.extend([
            "http://localhost:3000",
        ])

    return list(dict.fromkeys(origins))


def is_allowed_origin(origin: str, env_mode: Optional[EnvMode] = None) -> bool:
    return origin in build_allowed_origins(env_mode) or bool(ALLOW_ORIGIN_REGEX.match(origin))


def get_cors_headers(
    request: Optional[Request] = None,
    *,
    env_mode: Optional[EnvMode] = None,
) -> Dict[str, str]:
    if request is None:
        return {}

    origin = request.headers.get("origin")
    if not origin or not is_allowed_origin(origin, env_mode):
        return {}

    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": EXPOSED_CORS_HEADERS,
        "Vary": "Origin",
    }
