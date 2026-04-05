"""SSE streaming response headers with proper CORS support."""

from typing import Dict, Optional

from fastapi import Request

from core.utils.cors_headers import get_cors_headers


def get_sse_headers(request: Optional[Request] = None) -> Dict[str, str]:
    """Return headers for SSE StreamingResponse with proper CORS.

    Sets Access-Control-Allow-Origin to the requesting origin (if it matches
    *.recoder.xyz) so that browsers accept the response when credentials are
    included.  Falls back to the generic recoder.xyz origin when the request
    is unavailable or the origin doesn't match.
    """
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream",
    }

    cors_headers = get_cors_headers(request)
    if not cors_headers:
        cors_headers = {
            "Access-Control-Allow-Origin": "https://agents.recoder.xyz",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Expose-Headers": "X-Trace-Id, X-Request-Id, X-Connector-Id, X-Interop-Metadata",
            "Vary": "Origin",
        }

    headers.update(cors_headers)
    return headers
