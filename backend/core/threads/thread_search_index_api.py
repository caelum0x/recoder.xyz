"""
Thread Search Index API endpoints (Sprint 72 Phase 2).

Provides full-text search over indexed threads, batch indexing, and search history.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-search"])


# ============================================================================
# Pydantic Models
# ============================================================================

class IndexThreadRequest(BaseModel):
    thread_id: str
    agent_id: Optional[str] = None
    title: Optional[str] = None
    content_snippet: Optional[str] = None
    message_count: Optional[int] = None
    last_message_at: Optional[str] = None
    tags: Optional[List[str]] = None


class BatchIndexRequest(BaseModel):
    threads: List[IndexThreadRequest]


# ============================================================================
# Endpoints — Search
# ============================================================================

@router.get(
    "/threads/search",
    summary="Search threads",
    operation_id="search_threads_index",
)
async def search_threads(
    q: Optional[str] = Query(default=None),
    agent_id: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Search indexed threads using full-text search or return recent if no query."""
    try:
        conditions = ["tsi.user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if q:
            conditions.append("tsi.search_vector @@ plainto_tsquery('english', :q)")
            params["q"] = q

        if agent_id:
            conditions.append("tsi.agent_id = :agent_id")
            params["agent_id"] = agent_id

        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                conditions.append("tsi.tags && :tags")
                params["tags"] = tag_list

        where = " AND ".join(conditions)
        order = "tsi.last_message_at DESC NULLS LAST"
        if q:
            order = f"ts_rank(tsi.search_vector, plainto_tsquery('english', :q)) DESC, {order}"

        rows = await execute(
            f"SELECT tsi.* FROM thread_search_index tsi WHERE {where} ORDER BY {order} LIMIT :limit",
            params,
        )
        results = serialize_rows(rows)

        # Record search history
        if q:
            try:
                await execute_mutate(
                    """
                    INSERT INTO search_history (user_id, query, results_count)
                    VALUES (:user_id, :query, :results_count)
                    """,
                    {"user_id": user_id, "query": q, "results_count": len(results)},
                )
            except Exception as hist_err:
                logger.warning(f"Failed to record search history: {hist_err}")

        return results
    except Exception as e:
        logger.error(f"search_threads error: {e}")
        raise HTTPException(status_code=500, detail="Failed to search threads.")


@router.get(
    "/threads/search/history",
    summary="Get search history",
    operation_id="get_thread_search_history",
)
async def get_search_history(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return recent search queries for the authenticated user."""
    try:
        rows = await execute(
            "SELECT * FROM search_history WHERE user_id = :user_id ORDER BY searched_at DESC LIMIT :limit",
            {"user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"get_search_history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get search history.")


@router.delete(
    "/threads/search/history",
    summary="Clear search history",
    operation_id="clear_thread_search_history",
)
async def clear_search_history(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Clear all search history for the authenticated user."""
    try:
        await execute_mutate(
            "DELETE FROM search_history WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        return {"cleared": True}
    except Exception as e:
        logger.error(f"clear_search_history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear search history.")


@router.get(
    "/threads/search/stats",
    summary="Get thread search stats",
    operation_id="get_thread_search_stats",
)
async def get_search_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return total indexed count, by_agent breakdown, recent searches, and top queries."""
    try:
        # Total indexed
        total_row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM thread_search_index WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        total_indexed = int(total_row["cnt"]) if total_row else 0

        # By agent
        agent_rows = await execute(
            """
            SELECT agent_id, COUNT(*) AS cnt
            FROM thread_search_index
            WHERE user_id = :user_id AND agent_id IS NOT NULL
            GROUP BY agent_id
            ORDER BY cnt DESC
            """,
            {"user_id": user_id},
        )
        by_agent = {r["agent_id"]: int(r["cnt"]) for r in serialize_rows(agent_rows)}

        # Recent searches (last 7 days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        recent_row = await execute_one(
            """
            SELECT COUNT(*) AS cnt
            FROM search_history
            WHERE user_id = :user_id AND searched_at >= :cutoff
            """,
            {"user_id": user_id, "cutoff": cutoff.isoformat()},
        )
        recent_searches = int(recent_row["cnt"]) if recent_row else 0

        # Top 5 queries
        top_rows = await execute(
            """
            SELECT query, COUNT(*) AS cnt
            FROM search_history
            WHERE user_id = :user_id
            GROUP BY query
            ORDER BY cnt DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        top_queries = [{"query": r["query"], "count": int(r["cnt"])} for r in serialize_rows(top_rows)]

        return {
            "total_indexed": total_indexed,
            "by_agent": by_agent,
            "recent_searches": recent_searches,
            "top_queries": top_queries,
        }
    except Exception as e:
        logger.error(f"get_search_stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get search stats.")


# ============================================================================
# Endpoints — Indexing
# ============================================================================

@router.post(
    "/threads/index",
    summary="Index a thread",
    operation_id="index_thread_for_search",
)
async def index_thread(
    body: IndexThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert a thread into the search index."""
    try:
        tags_val = body.tags or []
        row = await execute_one(
            """
            INSERT INTO thread_search_index
              (user_id, thread_id, agent_id, title, content_snippet,
               message_count, last_message_at, tags)
            VALUES
              (:user_id, :thread_id, :agent_id, :title, :content_snippet,
               :message_count, :last_message_at, :tags)
            ON CONFLICT (user_id, thread_id) DO UPDATE SET
              agent_id = EXCLUDED.agent_id,
              title = EXCLUDED.title,
              content_snippet = EXCLUDED.content_snippet,
              message_count = EXCLUDED.message_count,
              last_message_at = EXCLUDED.last_message_at,
              tags = EXCLUDED.tags,
              indexed_at = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": body.thread_id,
                "agent_id": body.agent_id,
                "title": body.title,
                "content_snippet": body.content_snippet,
                "message_count": body.message_count or 0,
                "last_message_at": body.last_message_at,
                "tags": tags_val,
            },
        )
        result = serialize_row(row)

        # Update search vector
        if result and result.get("id"):
            try:
                await execute_mutate(
                    """
                    UPDATE thread_search_index
                    SET search_vector = to_tsvector('english',
                      coalesce(title, '') || ' ' || coalesce(content_snippet, ''))
                    WHERE id = :id
                    """,
                    {"id": result["id"]},
                )
            except Exception as vec_err:
                logger.warning(f"Failed to update search_vector: {vec_err}")

        return result
    except Exception as e:
        logger.error(f"index_thread error: {e}")
        raise HTTPException(status_code=500, detail="Failed to index thread.")


@router.post(
    "/threads/index/batch",
    summary="Batch index threads",
    operation_id="batch_index_threads_for_search",
)
async def batch_index_threads(
    body: BatchIndexRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert multiple threads into the search index."""
    indexed = 0
    errors = 0
    for thread in body.threads:
        try:
            tags_val = thread.tags or []
            row = await execute_one(
                """
                INSERT INTO thread_search_index
                  (user_id, thread_id, agent_id, title, content_snippet,
                   message_count, last_message_at, tags)
                VALUES
                  (:user_id, :thread_id, :agent_id, :title, :content_snippet,
                   :message_count, :last_message_at, :tags)
                ON CONFLICT (user_id, thread_id) DO UPDATE SET
                  agent_id = EXCLUDED.agent_id,
                  title = EXCLUDED.title,
                  content_snippet = EXCLUDED.content_snippet,
                  message_count = EXCLUDED.message_count,
                  last_message_at = EXCLUDED.last_message_at,
                  tags = EXCLUDED.tags,
                  indexed_at = now()
                RETURNING id, title, content_snippet
                """,
                {
                    "user_id": user_id,
                    "thread_id": thread.thread_id,
                    "agent_id": thread.agent_id,
                    "title": thread.title,
                    "content_snippet": thread.content_snippet,
                    "message_count": thread.message_count or 0,
                    "last_message_at": thread.last_message_at,
                    "tags": tags_val,
                },
            )
            if row:
                try:
                    await execute_mutate(
                        """
                        UPDATE thread_search_index
                        SET search_vector = to_tsvector('english',
                          coalesce(title, '') || ' ' || coalesce(content_snippet, ''))
                        WHERE id = :id
                        """,
                        {"id": row["id"]},
                    )
                except Exception:
                    pass
                indexed += 1
        except Exception as e:
            logger.warning(f"batch_index_threads item error for {thread.thread_id}: {e}")
            errors += 1

    return {"indexed": indexed, "errors": errors}


@router.delete(
    "/threads/index/{thread_id}",
    summary="Remove thread from search index",
    operation_id="remove_thread_from_search_index",
)
async def remove_from_index(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a thread from the search index."""
    try:
        await execute_mutate(
            "DELETE FROM thread_search_index WHERE thread_id = :thread_id AND user_id = :user_id",
            {"thread_id": thread_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"remove_from_index error: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove thread from index.")
