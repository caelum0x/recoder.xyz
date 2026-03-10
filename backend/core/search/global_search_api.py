"""
Global Search API — index-backed cross-resource search.

Provides ILIKE-based search over a materialised search_index table,
plus a reindex endpoint that rebuilds the index from source tables
and autocomplete suggestions.
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/global-search", tags=["global-search"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SearchIndexEntry(BaseModel):
    id: str
    user_id: str
    resource_type: str
    resource_id: str
    title: str
    content_preview: Optional[str] = None
    tags: list[str] = []
    updated_at: Optional[str] = None


class IndexedSearchResponse(BaseModel):
    results: list[SearchIndexEntry]
    total: int
    query: str


class SuggestionItem(BaseModel):
    title: str
    resource_type: str
    resource_id: str


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]
    query: str


class ReindexResponse(BaseModel):
    indexed: dict[str, int]
    errors: list[str]


# ---------------------------------------------------------------------------
# GET /global-search — search using ILIKE on title
# ---------------------------------------------------------------------------

@router.get("", response_model=IndexedSearchResponse, summary="Search across all indexed resources")
async def indexed_search(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    resource_type: Optional[str] = Query(default=None, description="Filter by resource type"),
    limit: int = Query(default=20, le=100, description="Max results"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Search the global search index using ILIKE on title."""
    search_term = f"%{q}%"
    params: dict = {"user_id": user_id, "q": search_term, "lim": limit}

    where_clauses = ["user_id = :user_id", "title ILIKE :q"]
    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type

    where_sql = " AND ".join(where_clauses)

    rows = await execute(
        f"""
        SELECT id::text, user_id::text, resource_type, resource_id,
               title, content_preview, tags, updated_at::text
        FROM search_index
        WHERE {where_sql}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT :lim
        """,
        params,
    )

    results = [
        SearchIndexEntry(
            id=str(r["id"]),
            user_id=str(r["user_id"]),
            resource_type=r["resource_type"],
            resource_id=r["resource_id"],
            title=r["title"],
            content_preview=r.get("content_preview"),
            tags=r.get("tags") or [],
            updated_at=r.get("updated_at"),
        )
        for r in (rows or [])
    ]

    return IndexedSearchResponse(results=results, total=len(results), query=q)


# ---------------------------------------------------------------------------
# POST /global-search/reindex — rebuild index from source tables
# ---------------------------------------------------------------------------

@router.post("/reindex", response_model=ReindexResponse, summary="Rebuild search index from source tables")
async def reindex(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Rebuild the search index for the authenticated user from source tables."""
    indexed: dict[str, int] = {}
    errors: list[str] = []

    # --- Agents ---
    try:
        agents = await execute(
            "SELECT agent_id, name, description FROM agents WHERE account_id = :uid",
            {"uid": user_id},
        )
        count = 0
        for a in (agents or []):
            await execute_mutate(
                """
                INSERT INTO search_index (user_id, resource_type, resource_id, title, content_preview, updated_at)
                VALUES (:user_id, 'agent', :rid, :title, :preview, now())
                ON CONFLICT (resource_type, resource_id)
                DO UPDATE SET title = EXCLUDED.title, content_preview = EXCLUDED.content_preview, updated_at = now()
                """,
                {
                    "user_id": user_id,
                    "rid": str(a["agent_id"]),
                    "title": a["name"] or "Untitled Agent",
                    "preview": (a.get("description") or "")[:200],
                },
            )
            count += 1
        indexed["agents"] = count
    except Exception as e:
        logger.warning(f"[REINDEX] agents failed: {e}")
        errors.append(f"agents: {e}")

    # --- Threads ---
    try:
        threads = await execute(
            """
            SELECT t.thread_id, p.name AS project_name
            FROM threads t
            LEFT JOIN projects p ON t.project_id = p.project_id
            WHERE t.account_id = :uid
            """,
            {"uid": user_id},
        )
        count = 0
        for t in (threads or []):
            title = t.get("project_name") or "Untitled Thread"
            await execute_mutate(
                """
                INSERT INTO search_index (user_id, resource_type, resource_id, title, updated_at)
                VALUES (:user_id, 'thread', :rid, :title, now())
                ON CONFLICT (resource_type, resource_id)
                DO UPDATE SET title = EXCLUDED.title, updated_at = now()
                """,
                {
                    "user_id": user_id,
                    "rid": str(t["thread_id"]),
                    "title": title,
                },
            )
            count += 1
        indexed["threads"] = count
    except Exception as e:
        logger.warning(f"[REINDEX] threads failed: {e}")
        errors.append(f"threads: {e}")

    # --- Saved Prompts ---
    try:
        prompts = await execute(
            "SELECT id, title, content FROM saved_prompts WHERE user_id = :uid",
            {"uid": user_id},
        )
        count = 0
        for p in (prompts or []):
            await execute_mutate(
                """
                INSERT INTO search_index (user_id, resource_type, resource_id, title, content_preview, updated_at)
                VALUES (:user_id, 'prompt', :rid, :title, :preview, now())
                ON CONFLICT (resource_type, resource_id)
                DO UPDATE SET title = EXCLUDED.title, content_preview = EXCLUDED.content_preview, updated_at = now()
                """,
                {
                    "user_id": user_id,
                    "rid": str(p["id"]),
                    "title": p["title"] or "Untitled Prompt",
                    "preview": (p.get("content") or "")[:200],
                },
            )
            count += 1
        indexed["saved_prompts"] = count
    except Exception as e:
        logger.warning(f"[REINDEX] saved_prompts failed: {e}")
        errors.append(f"saved_prompts: {e}")

    # --- Shared Prompt Snippets ---
    try:
        snippets = await execute(
            "SELECT id, title, content FROM shared_prompt_snippets WHERE user_id = :uid",
            {"uid": user_id},
        )
        count = 0
        for s in (snippets or []):
            await execute_mutate(
                """
                INSERT INTO search_index (user_id, resource_type, resource_id, title, content_preview, updated_at)
                VALUES (:user_id, 'prompt', :rid, :title, :preview, now())
                ON CONFLICT (resource_type, resource_id)
                DO UPDATE SET title = EXCLUDED.title, content_preview = EXCLUDED.content_preview, updated_at = now()
                """,
                {
                    "user_id": user_id,
                    "rid": str(s["id"]),
                    "title": s["title"] or "Untitled Snippet",
                    "preview": (s.get("content") or "")[:200],
                },
            )
            count += 1
        indexed["shared_prompt_snippets"] = count
    except Exception as e:
        logger.warning(f"[REINDEX] shared_prompt_snippets failed: {e}")
        errors.append(f"shared_prompt_snippets: {e}")

    # --- Knowledge Base Entries ---
    try:
        kb_entries = await execute(
            "SELECT entry_id, filename FROM knowledge_base_entries WHERE account_id = :uid",
            {"uid": user_id},
        )
        count = 0
        for k in (kb_entries or []):
            await execute_mutate(
                """
                INSERT INTO search_index (user_id, resource_type, resource_id, title, updated_at)
                VALUES (:user_id, 'knowledge_entry', :rid, :title, now())
                ON CONFLICT (resource_type, resource_id)
                DO UPDATE SET title = EXCLUDED.title, updated_at = now()
                """,
                {
                    "user_id": user_id,
                    "rid": str(k["entry_id"]),
                    "title": k.get("filename") or "Knowledge Entry",
                },
            )
            count += 1
        indexed["knowledge_entries"] = count
    except Exception as e:
        logger.warning(f"[REINDEX] knowledge_base_entries failed: {e}")
        errors.append(f"knowledge_base_entries: {e}")

    logger.info(f"[REINDEX] user={user_id[:8]}... indexed={indexed} errors={len(errors)}")
    return ReindexResponse(indexed=indexed, errors=errors)


# ---------------------------------------------------------------------------
# GET /global-search/suggestions — autocomplete title prefix
# ---------------------------------------------------------------------------

@router.get("/suggestions", response_model=SuggestionsResponse, summary="Autocomplete suggestions")
async def suggestions(
    q: str = Query(..., min_length=1, max_length=100, description="Prefix query"),
    limit: int = Query(default=5, le=20, description="Max suggestions"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return autocomplete suggestions matching title prefix."""
    prefix = f"{q}%"
    rows = await execute(
        """
        SELECT title, resource_type, resource_id
        FROM search_index
        WHERE user_id = :user_id AND title ILIKE :prefix
        ORDER BY updated_at DESC NULLS LAST
        LIMIT :lim
        """,
        {"user_id": user_id, "prefix": prefix, "lim": limit},
    )

    items = [
        SuggestionItem(
            title=r["title"],
            resource_type=r["resource_type"],
            resource_id=r["resource_id"],
        )
        for r in (rows or [])
    ]

    return SuggestionsResponse(suggestions=items, query=q)
