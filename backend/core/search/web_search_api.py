"""
Web Search Proxy API — authenticated endpoint that proxies to self-hosted SearXNG.

Allows any authenticated client (CLI, external integrations, recoder-code)
to perform web searches via the Recoder API without direct access to SearXNG.
SearXNG runs on the same infrastructure at http://searxng:8080 (Docker) or
http://127.0.0.1:8888 (host-level processes like the backend venv).
"""

import os
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(prefix="/web-search", tags=["web-search"])

# Resolve SearXNG URL from environment — same logic as web_search_tool.py
SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://127.0.0.1:8888")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class WebSearchResult(BaseModel):
    title: str
    url: str
    content: Optional[str] = None
    engine: Optional[str] = None
    published_date: Optional[str] = None
    score: Optional[float] = None


class WebSearchResponse(BaseModel):
    query: str
    total: int
    results: List[WebSearchResult]
    searxng_url: str  # informational only, shows which instance was used


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=WebSearchResponse, summary="Search the web via SearXNG")
async def web_search(
    q: str = Query(..., min_length=1, max_length=500, description="Search query"),
    limit: int = Query(default=15, ge=1, le=50, description="Max results to return"),
    language: str = Query(default="en-US", description="Language for results"),
    time_range: Optional[str] = Query(default=None, description="Time range: day, week, month, year"),
    categories: str = Query(default="general", description="Search categories: general, news, images, etc."),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Proxy authenticated web search requests to the self-hosted SearXNG instance.

    Returns structured search results. Used by recoder-code CLI and external integrations
    that cannot reach SearXNG directly.
    """
    params: dict = {
        "q": q,
        "format": "json",
        "pageno": "1",
        "language": language,
        "categories": categories,
    }
    if time_range:
        params["time_range"] = time_range

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{SEARXNG_URL}/search", params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        logger.error(f"SearXNG returned HTTP error: {exc.response.status_code}")
        raise HTTPException(status_code=502, detail=f"Search backend returned {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error(f"Could not reach SearXNG at {SEARXNG_URL}: {exc}")
        raise HTTPException(status_code=503, detail="Search backend is unreachable. Try again later.")
    except Exception as exc:
        logger.error(f"Web search proxy error: {exc}")
        raise HTTPException(status_code=500, detail="Internal search error")

    raw_results = data.get("results", [])[:limit]
    results = [
        WebSearchResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            content=r.get("content"),
            engine=r.get("engine"),
            published_date=r.get("publishedDate"),
            score=r.get("score"),
        )
        for r in raw_results
    ]

    return WebSearchResponse(
        query=q,
        total=len(results),
        results=results,
        searxng_url=SEARXNG_URL,
    )
