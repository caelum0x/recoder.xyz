"""
Thread Analytics API endpoints.

Provides per-thread analytics (message counts, token usage, cost, tool breakdown)
and aggregate analytics across all threads for a user.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import (
    verify_and_get_user_id_from_jwt,
    require_thread_access,
    AuthorizedThreadAccess,
)
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["thread-analytics"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ThreadAnalytics(BaseModel):
    id: Optional[str] = None
    thread_id: str
    account_id: str
    total_messages: int = 0
    user_messages: int = 0
    assistant_messages: int = 0
    tool_messages: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_cost: float = 0.0
    avg_response_time_ms: int = 0
    tool_call_count: int = 0
    tool_breakdown: Dict[str, Any] = {}
    model_breakdown: Dict[str, Any] = {}
    first_message_at: Optional[str] = None
    last_message_at: Optional[str] = None
    duration_seconds: int = 0
    sentiment_score: Optional[float] = None
    computed_at: Optional[str] = None


class ThreadAnalyticsOverview(BaseModel):
    total_threads: int = 0
    total_messages: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_cost: float = 0.0
    avg_messages_per_thread: float = 0.0
    avg_cost_per_thread: float = 0.0
    top_tools: Dict[str, int] = {}
    top_models: Dict[str, int] = {}


class TopThread(BaseModel):
    thread_id: str
    thread_name: Optional[str] = None
    value: float = 0.0
    total_messages: int = 0
    total_cost: float = 0.0
    last_message_at: Optional[str] = None


class TopThreadsResponse(BaseModel):
    threads: List[TopThread] = []
    metric: str = "total_messages"


# ============================================================================
# Helpers
# ============================================================================

def _to_iso(val: Any) -> Optional[str]:
    """Convert a datetime-like value to ISO string, or None."""
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)


def _row_to_analytics(row: Dict[str, Any]) -> ThreadAnalytics:
    """Convert a DB row to ThreadAnalytics model."""
    return ThreadAnalytics(
        id=str(row["id"]) if row.get("id") else None,
        thread_id=str(row["thread_id"]),
        account_id=row["account_id"],
        total_messages=row.get("total_messages", 0),
        user_messages=row.get("user_messages", 0),
        assistant_messages=row.get("assistant_messages", 0),
        tool_messages=row.get("tool_messages", 0),
        total_tokens_in=row.get("total_tokens_in", 0),
        total_tokens_out=row.get("total_tokens_out", 0),
        total_cost=float(row.get("total_cost", 0)),
        avg_response_time_ms=row.get("avg_response_time_ms", 0),
        tool_call_count=row.get("tool_call_count", 0),
        tool_breakdown=row.get("tool_breakdown") or {},
        model_breakdown=row.get("model_breakdown") or {},
        first_message_at=_to_iso(row.get("first_message_at")),
        last_message_at=_to_iso(row.get("last_message_at")),
        duration_seconds=row.get("duration_seconds", 0),
        sentiment_score=float(row["sentiment_score"]) if row.get("sentiment_score") is not None else None,
        computed_at=_to_iso(row.get("computed_at")),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/threads/{thread_id}/analytics",
    response_model=ThreadAnalytics,
    summary="Get thread analytics",
)
async def get_thread_analytics(
    thread_id: str,
    auth: AuthorizedThreadAccess = Depends(require_thread_access),
):
    """
    Get pre-computed analytics for a specific thread.
    Returns zeros if analytics haven't been computed yet.
    """
    try:
        sql = """
        SELECT ta.*, t.account_id
        FROM thread_analytics ta
        JOIN threads t ON t.thread_id = ta.thread_id
        WHERE ta.thread_id = :thread_id
        """

        row = await execute_one(sql, {"thread_id": thread_id})

        if not row:
            # Return empty analytics if not computed yet
            # Fetch account_id from the thread itself
            thread_row = await execute_one(
                "SELECT account_id FROM threads WHERE thread_id = :thread_id",
                {"thread_id": thread_id},
            )
            account_id = thread_row["account_id"] if thread_row else auth.user_id

            return ThreadAnalytics(
                thread_id=thread_id,
                account_id=account_id,
            )

        return _row_to_analytics(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch thread analytics")


@router.post(
    "/threads/{thread_id}/analytics/calculate",
    response_model=ThreadAnalytics,
    summary="Compute thread analytics from messages",
)
async def calculate_thread_analytics(
    thread_id: str,
    auth: AuthorizedThreadAccess = Depends(require_thread_access),
):
    """
    Compute analytics for a thread from its messages and upsert into thread_analytics.
    This scans all messages in the thread and aggregates counts and metadata.
    """
    try:
        # Get thread info
        thread_row = await execute_one(
            "SELECT account_id FROM threads WHERE thread_id = :thread_id",
            {"thread_id": thread_id},
        )
        if not thread_row:
            raise HTTPException(status_code=404, detail="Thread not found")

        account_id = thread_row["account_id"]

        # Aggregate from messages table
        stats_sql = """
        SELECT
            COUNT(*) AS total_messages,
            COUNT(*) FILTER (WHERE role = 'user') AS user_messages,
            COUNT(*) FILTER (WHERE role = 'assistant') AS assistant_messages,
            COUNT(*) FILTER (WHERE role = 'tool') AS tool_messages,
            MIN(created_at) AS first_message_at,
            MAX(created_at) AS last_message_at,
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::INTEGER AS duration_seconds
        FROM messages
        WHERE thread_id = :thread_id
        """

        stats = await execute_one(stats_sql, {"thread_id": thread_id})

        if not stats or stats["total_messages"] == 0:
            return ThreadAnalytics(thread_id=thread_id, account_id=account_id)

        # Count tool calls from assistant messages that have tool_calls in content
        tool_sql = """
        SELECT COUNT(*) AS tool_call_count
        FROM messages
        WHERE thread_id = :thread_id AND role = 'tool'
        """
        tool_row = await execute_one(tool_sql, {"thread_id": thread_id})
        tool_call_count = tool_row["tool_call_count"] if tool_row else 0

        # Upsert into thread_analytics
        upsert_sql = """
        INSERT INTO thread_analytics (
            thread_id, account_id, total_messages, user_messages,
            assistant_messages, tool_messages, total_tokens_in, total_tokens_out,
            total_cost, avg_response_time_ms, tool_call_count,
            tool_breakdown, model_breakdown,
            first_message_at, last_message_at, duration_seconds,
            computed_at, updated_at
        ) VALUES (
            :thread_id, :account_id, :total_messages, :user_messages,
            :assistant_messages, :tool_messages, 0, 0,
            0, 0, :tool_call_count,
            :tool_breakdown, :model_breakdown,
            :first_message_at, :last_message_at, :duration_seconds,
            NOW(), NOW()
        )
        ON CONFLICT (thread_id) DO UPDATE SET
            total_messages = EXCLUDED.total_messages,
            user_messages = EXCLUDED.user_messages,
            assistant_messages = EXCLUDED.assistant_messages,
            tool_messages = EXCLUDED.tool_messages,
            tool_call_count = EXCLUDED.tool_call_count,
            first_message_at = EXCLUDED.first_message_at,
            last_message_at = EXCLUDED.last_message_at,
            duration_seconds = EXCLUDED.duration_seconds,
            computed_at = NOW(),
            updated_at = NOW()
        RETURNING *
        """

        result = await execute_one(upsert_sql, {
            "thread_id": thread_id,
            "account_id": account_id,
            "total_messages": stats["total_messages"],
            "user_messages": stats["user_messages"],
            "assistant_messages": stats["assistant_messages"],
            "tool_messages": stats["tool_messages"],
            "tool_call_count": tool_call_count,
            "tool_breakdown": {},
            "model_breakdown": {},
            "first_message_at": stats["first_message_at"],
            "last_message_at": stats["last_message_at"],
            "duration_seconds": stats.get("duration_seconds") or 0,
        })

        if not result:
            raise HTTPException(status_code=500, detail="Failed to compute thread analytics")

        return _row_to_analytics(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error computing analytics for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute thread analytics")


@router.get(
    "/threads/analytics/overview",
    response_model=ThreadAnalyticsOverview,
    summary="Get aggregate thread analytics overview",
)
async def get_threads_analytics_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get aggregate analytics across all threads for the authenticated user.
    Summarizes total messages, tokens, cost, and top tools/models.
    """
    try:
        sql = """
        SELECT
            COUNT(*) AS total_threads,
            COALESCE(SUM(total_messages), 0) AS total_messages,
            COALESCE(SUM(total_tokens_in), 0) AS total_tokens_in,
            COALESCE(SUM(total_tokens_out), 0) AS total_tokens_out,
            COALESCE(SUM(total_cost), 0) AS total_cost
        FROM thread_analytics
        WHERE account_id = :account_id
        """

        row = await execute_one(sql, {"account_id": user_id})

        if not row or row["total_threads"] == 0:
            return ThreadAnalyticsOverview()

        total_threads = row["total_threads"]
        total_messages = row["total_messages"]
        total_cost = float(row["total_cost"])

        # Aggregate tool and model breakdowns
        breakdown_sql = """
        SELECT tool_breakdown, model_breakdown
        FROM thread_analytics
        WHERE account_id = :account_id
        AND (tool_breakdown != '{}' OR model_breakdown != '{}')
        """

        breakdown_rows = await execute(breakdown_sql, {"account_id": user_id})

        top_tools: Dict[str, int] = {}
        top_models: Dict[str, int] = {}

        for brow in (breakdown_rows or []):
            for tool, count in (brow.get("tool_breakdown") or {}).items():
                if isinstance(count, (int, float)):
                    top_tools[tool] = top_tools.get(tool, 0) + int(count)
            for model, count in (brow.get("model_breakdown") or {}).items():
                if isinstance(count, (int, float)):
                    top_models[model] = top_models.get(model, 0) + int(count)

        # Keep only top 10
        top_tools = dict(sorted(top_tools.items(), key=lambda x: x[1], reverse=True)[:10])
        top_models = dict(sorted(top_models.items(), key=lambda x: x[1], reverse=True)[:10])

        return ThreadAnalyticsOverview(
            total_threads=total_threads,
            total_messages=total_messages,
            total_tokens_in=row["total_tokens_in"],
            total_tokens_out=row["total_tokens_out"],
            total_cost=round(total_cost, 4),
            avg_messages_per_thread=round(total_messages / total_threads, 1) if total_threads > 0 else 0,
            avg_cost_per_thread=round(total_cost / total_threads, 4) if total_threads > 0 else 0,
            top_tools=top_tools,
            top_models=top_models,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching thread analytics overview for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch thread analytics overview")


@router.get(
    "/threads/analytics/top",
    response_model=TopThreadsResponse,
    summary="Get top threads by metric",
)
async def get_top_threads(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    metric: str = Query("total_messages", description="Metric to rank by: total_messages, total_cost, total_tokens_in, duration_seconds"),
    limit: int = Query(10, ge=1, le=50, description="Number of top threads to return"),
):
    """
    Get the top threads ranked by a specific metric (messages, cost, tokens, duration).
    Returns thread names and key stats for dashboard display.
    """
    try:
        valid_metrics = {"total_messages", "total_cost", "total_tokens_in", "total_tokens_out", "duration_seconds", "tool_call_count"}
        if metric not in valid_metrics:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metric. Must be one of: {', '.join(sorted(valid_metrics))}"
            )

        sql = f"""
        SELECT
            ta.thread_id,
            t.name AS thread_name,
            ta.{metric} AS value,
            ta.total_messages,
            ta.total_cost,
            ta.last_message_at
        FROM thread_analytics ta
        JOIN threads t ON t.thread_id = ta.thread_id
        WHERE ta.account_id = :account_id
        ORDER BY ta.{metric} DESC
        LIMIT :limit
        """

        rows = await execute(sql, {"account_id": user_id, "limit": limit})

        threads = [
            TopThread(
                thread_id=str(row["thread_id"]),
                thread_name=row.get("thread_name"),
                value=float(row["value"]) if row["value"] is not None else 0.0,
                total_messages=row.get("total_messages", 0),
                total_cost=float(row.get("total_cost", 0)),
                last_message_at=_to_iso(row.get("last_message_at")),
            )
            for row in (rows or [])
        ]

        return TopThreadsResponse(threads=threads, metric=metric)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top threads for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch top threads")
