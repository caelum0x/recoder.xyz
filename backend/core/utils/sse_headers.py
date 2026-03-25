"""SSE streaming response headers with proper CORS support."""

import re
from typing import Dict, Optional
from fastapi import Request


_ALLOWED_ORIGIN_RE = re.compile(r"^https://([a-z0-9-]+\.)?recoder\.xyz$")


def get_sse_headers(request: Optional[Request] = None) -> Dict[str, str]:
    """Return headers for SSE StreamingResponse with proper CORS.

    Sets Access-Control-Allow-Origin to the requesting origin (if it matches
    *.recoder.xyz) so that browsers accept the response when credentials are
    included.  Falls back to the generic recoder.xyz origin when the request
    is unavailable or the origin doesn't match.
    """
    origin = "https://agents.recoder.xyz"  # safe default

    if request:
        req_origin = request.headers.get("origin", "")
        if req_origin and _ALLOWED_ORIGIN_RE.match(req_origin):
            origin = req_origin

    return {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
    }
