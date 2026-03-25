"""
Thread Search & Filters API.

Provides advanced thread search with filters, search history tracking,
and search suggestions. Uses the thread_search_index table for fast lookups.
"""

import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["thread-search-filters"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SearchThreadsRequest(BaseModel):
    query: Optional[str] = None
    agent_id: Optional[str] = None
    has_tool_calls: Optional[bool] = None
    has_errors: Optional[bool] = None
    tags: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    sort_by: str = Field(default="recent", description="recent, oldest, most_messages")
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class IndexThreadRequest(BaseModel):
    agent_id: Optional[str] = None
    content_preview: Optional[str] = None
    message_count: int = 0
    has_tool_calls: bool = False
    has_errors: bool = False
    last_message_at: Optional[str] = None
    tags: Optional[List[str]] = None


class ThreadSearchResult(BaseModel):
    id: str
    thread_id: str
    agent_id: Optional[str] = None
    content_preview: Optional[str] = None
    message_count: int = 0
    has_tool_calls: bool = False
    has_errors: bool = False
    last_message_at: Optional[str] = None
    tags: List[str] = []
    indexed_at: str


class SearchHistoryEntry(BaseModel):
    id: str
    query: str
    filters: Dict[str, Any] = {}
    result_count: int = 0
    searched_at: str


# ============================================================================
# Helpers
# ============================================================================

def _row_to_search_result(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a database row to a search result dict."""
    return {
        "id": str(row["id"]),
        "thread_id": row["thread_id"],
        "agent_id": row.get("agent_id"),
        "content_preview": row.get("content_preview"),
        "message_count": row.get("message_count", 0),
        "has_tool_calls": row.get("has_tool_calls", False),
        "has_errors": row.get("has_errors", False),
        "last_message_at": row["last_message_at"].isoformat() if hasattr(row.get("last_message_at", ""), "isoformat") else row.get("last_message_at"),
        "tags": row.get("tags", []) or [],
        "indexed_at": row["indexed_at"].isoformat() if hasattr(row.get("indexed_at", ""), "isoformat") else str(row.get("indexed_at", "")),
    }


def _row_to_history_entry(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a database row to a search history entry dict."""
    return {
        "id": str(row["id"]),
        "query": row["query"],
        "filters": row.get("filters", {}),
        "result_count": row.get("result_count", 0),
        "searched_at": row["searched_at"].isoformat() if hasattr(row.get("searched_at", ""), "isoformat") else str(row.get("searched_at", "")),
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/threads/search/filtered",
    summary="Search threads with filters",
    operation_id="search_threads_filtered",
)
async def search_threads_filtered(
    body: SearchThreadsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Search threads with advanced filters. Records search in history."""
    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id}

        # Text search on content_preview
        if body.query:
            where_clauses.append("content_preview ILIKE :query")
            params["query"] = f"%{body.query}%"

        # Agent filter
        if body.agent_id:
            where_clauses.append("agent_id::text = :agent_id")
            params["agent_id"] = body.agent_id

        # Boolean filters
        if body.has_tool_calls is not None:
            where_clauses.append("has_tool_calls = :has_tool_calls")
            params["has_tool_calls"] = body.has_tool_calls

        if body.has_errors is not None:
            where_clauses.append("has_errors = :has_errors")
            params["has_errors"] = body.has_errors

        # Tags filter (any match)
        if body.tags and len(body.tags) > 0:
            where_clauses.append("tags && :tags")
            params["tags"] = body.tags

        # Date range filters
        if body.date_from:
            where_clauses.append("last_message_at >= :date_from")
            params["date_from"] = body.date_from

        if body.date_to:
            where_clauses.append("last_message_at <= :date_to")
            params["date_to"] = body.date_to

        where_sql = " AND ".join(where_clauses)

        # Sort
        sort_map = {
            "recent": "last_message_at DESC NULLS LAST",
            "oldest": "last_message_at ASC NULLS LAST",
            "most_messages": "message_count DESC",
        }
        order_sql = sort_map.get(body.sort_by, "last_message_at DESC NULLS LAST")

        # Count total
        count_rows = await execute(
            f"SELECT COUNT(*) as count FROM thread_search_index WHERE {where_sql}",
            params,
        )
        total = count_rows[0]["count"] if count_rows else 0

        # Fetch results
        params["limit"] = body.limit
        params["offset"] = body.offset

        rows = await execute(
            f"""
            SELECT * FROM thread_search_index
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        results = [_row_to_search_result(r) for r in rows]

        # Record search history (fire and forget)
        try:
            filters_json = {}
            if body.agent_id:
                filters_json["agent_id"] = body.agent_id
            if body.has_tool_calls is not None:
                filters_json["has_tool_calls"] = body.has_tool_calls
            if body.has_errors is not None:
                filters_json["has_errors"] = body.has_errors
            if body.tags:
                filters_json["tags"] = body.tags
            if body.date_from:
                filters_json["date_from"] = body.date_from
            if body.date_to:
                filters_json["date_to"] = body.date_to

            await execute_mutate(
                """
                INSERT INTO search_history (user_id, query, filters, result_count)
                VALUES (:user_id, :query_text, :filters, :result_count)
                """,
                {
                    "user_id": user_id,
                    "query_text": body.query or "",
                    "filters": json.dumps(filters_json),
                    "result_count": total,
                },
            )
        except Exception as hist_err:
            logger.warning(f"Failed to record search history: {hist_err}")

        return {
            "results": results,
            "total": total,
            "limit": body.limit,
            "offset": body.offset,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching threads: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/threads/{thread_id}/index",
    summary="Index or reindex a thread",
    operation_id="index_thread",
)
async def index_thread(
    thread_id: str,
    body: IndexThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Index or reindex a thread for search."""
    try:
        row = await execute_one(
            """
            INSERT INTO thread_search_index (user_id, thread_id, agent_id, content_preview, message_count, has_tool_calls, has_errors, last_message_at, tags, indexed_at)
            VALUES (:user_id, :thread_id, :agent_id, :content_preview, :message_count, :has_tool_calls, :has_errors, :last_message_at, :tags, now())
            ON CONFLICT (user_id, thread_id) DO UPDATE SET
                agent_id = :agent_id,
                content_preview = :content_preview,
                message_count = :message_count,
                has_tool_calls = :has_tool_calls,
                has_errors = :has_errors,
                last_message_at = :last_message_at,
                tags = :tags,
                indexed_at = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "agent_id": body.agent_id,
                "content_preview": body.content_preview,
                "message_count": body.message_count,
                "has_tool_calls": body.has_tool_calls,
                "has_errors": body.has_errors,
                "last_message_at": body.last_message_at,
                "tags": body.tags or [],
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to index thread")

        return _row_to_search_result(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error indexing thread {thread_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/threads/search/history",
    summary="Get search history",
    operation_id="get_search_history",
)
async def get_search_history(
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get recent search history for the user."""
    try:
        rows = await execute(
            """
            SELECT * FROM search_history
            WHERE user_id::text = :user_id
            ORDER BY searched_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )

        entries = [_row_to_history_entry(r) for r in rows]
        return {"history": entries}

    except Exception as e:
        logger.error(f"Error getting search history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/threads/search/suggestions",
    summary="Get search suggestions",
    operation_id="get_search_suggestions",
)
async def get_search_suggestions(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get search suggestions based on recent queries and popular filters."""
    try:
        # Recent unique queries
        recent_queries = await execute(
            """
            SELECT DISTINCT query, MAX(searched_at) as last_used
            FROM search_history
            WHERE user_id::text = :user_id AND query != ''
            GROUP BY query
            ORDER BY last_used DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )

        # Popular tags from user's indexed threads
        popular_tags = await execute(
            """
            SELECT UNNEST(tags) as tag, COUNT(*) as count
            FROM thread_search_index
            WHERE user_id::text = :user_id AND tags != '{}'
            GROUP BY tag
            ORDER BY count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Agents used in threads
        active_agents = await execute(
            """
            SELECT DISTINCT agent_id, COUNT(*) as thread_count
            FROM thread_search_index
            WHERE user_id::text = :user_id AND agent_id IS NOT NULL
            GROUP BY agent_id
            ORDER BY thread_count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        return {
            "recent_queries": [
                {"query": r["query"], "last_used": r["last_used"].isoformat() if hasattr(r.get("last_used", ""), "isoformat") else str(r.get("last_used", ""))}
                for r in recent_queries
            ],
            "popular_tags": [
                {"tag": r["tag"], "count": r["count"]}
                for r in popular_tags
            ],
            "active_agents": [
                {"agent_id": r["agent_id"], "thread_count": r["thread_count"]}
                for r in active_agents
            ],
        }

    except Exception as e:
        logger.error(f"Error getting search suggestions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete(
    "/threads/search/history",
    summary="Clear search history",
    operation_id="clear_search_history",
)
async def clear_search_history(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Clear all search history for the user."""
    try:
        await execute_mutate(
            "DELETE FROM search_history WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )

        return {"success": True, "message": "Search history cleared"}

    except Exception as e:
        logger.error(f"Error clearing search history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
