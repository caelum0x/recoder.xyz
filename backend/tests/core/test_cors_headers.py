import pytest
from starlette.requests import Request

from core.utils.config import EnvMode
from core.utils.cors_headers import build_allowed_origins, get_cors_headers, is_allowed_origin
from core.utils.sse_headers import get_sse_headers


def make_request(origin: str) -> Request:
    return Request({
        "type": "http",
        "headers": [(b"origin", origin.encode("utf-8"))],
    })


def test_build_allowed_origins_local_includes_localhost():
    origins = build_allowed_origins(EnvMode.LOCAL)
    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:3000" in origins


def test_build_allowed_origins_staging_includes_localhost_once():
    origins = build_allowed_origins(EnvMode.STAGING)
    assert origins.count("http://localhost:3000") == 1


def test_is_allowed_origin_accepts_recoder_subdomain():
    assert is_allowed_origin("https://agents.recoder.xyz", EnvMode.PRODUCTION)


def test_is_allowed_origin_accepts_vercel_preview():
    assert is_allowed_origin("https://foo-recoderxyz.vercel.app", EnvMode.PRODUCTION)


def test_is_allowed_origin_rejects_untrusted_origin():
    assert not is_allowed_origin("https://evil.example.com", EnvMode.PRODUCTION)


def test_get_cors_headers_returns_origin_for_trusted_request():
    request = make_request("https://agents.recoder.xyz")
    headers = get_cors_headers(request, env_mode=EnvMode.PRODUCTION)
    assert headers["Access-Control-Allow-Origin"] == "https://agents.recoder.xyz"
    assert headers["Access-Control-Allow-Credentials"] == "true"
    assert headers["Vary"] == "Origin"


def test_get_cors_headers_returns_empty_for_untrusted_request():
    request = make_request("https://evil.example.com")
    assert get_cors_headers(request, env_mode=EnvMode.PRODUCTION) == {}


def test_get_sse_headers_preserves_request_origin():
    request = make_request("https://agents.recoder.xyz")
    headers = get_sse_headers(request)
    assert headers["Access-Control-Allow-Origin"] == "https://agents.recoder.xyz"
    assert headers["Access-Control-Allow-Credentials"] == "true"
    assert headers["Content-Type"] == "text/event-stream"


def test_get_sse_headers_falls_back_when_request_missing():
    headers = get_sse_headers(None)
    assert headers["Access-Control-Allow-Origin"] == "https://agents.recoder.xyz"
