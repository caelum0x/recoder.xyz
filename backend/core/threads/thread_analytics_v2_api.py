"""
Thread Analytics V2 API (Sprint 74 Phase 2).

Provides per-thread analytics upsert, event recording, aggregate summary,
trends, and top-threads endpoints backed by thread_analytics_v2 + thread_events tables.
"""

import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_mutate, execute_one, serialize_row, serialize_rows
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["thread-analytics-v2"])


# ============================================================================
# Pydantic Models
# ============================================================================


class UpsertThreadAnalyticsRequest(BaseModel):
    agent_id: Optional[str] = None
    total_messages: Optional[int] = None
    user_messages: Optional[int] = None
    agent_messages: Optional[int] = None
    total_tokens: Optional[int] = None
    avg_response_time_ms: Optional[int] = None
    session_duration_ms: Optional[int] = None
    user_satisfaction_score: Optional[float] = None
    completion_rate: Optional[float] = None


class RecordEventRequest(BaseModel):
    event_type: str = Field(
        ...,
        description="One of: message_sent, message_received, file_uploaded, tool_used, session_start, session_end, error, rating",
    )
    event_data: Optional[Dict[str, Any]] = Field(default_factory=dict)


VALID_EVENT_TYPES = {
    "message_sent", "message_received", "file_uploaded", "tool_used",
    "session_start", "session_end", "error", "rating",
}


# ============================================================================
# Summary / Trends / Top — MUST be BEFORE /{thread_id} routes
# ============================================================================


@router.get(
    "/analytics/summary",
    summary="Get aggregate thread analytics summary",
    operation_id="get_thread_analytics_summary_v2",
)
async def get_analytics_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Aggregate analytics across all threads for the authenticated user."""
    try:
        agg_row = await execute_one(
            """
            SELECT
                COUNT(*) AS total_threads,
                COALESCE(AVG(total_messages), 0) AS avg_messages,
                COALESCE(AVG(total_tokens), 0) AS avg_tokens,
                COALESCE(AVG(avg_response_time_ms), 0) AS avg_response_time,
                COALESCE(AVG(user_satisfaction_score), 0) AS avg_satisfaction
            FROM thread_analytics_v2
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        total_threads = int(agg_row["total_threads"]) if agg_row else 0
        avg_messages = float(agg_row["avg_messages"]) if agg_row else 0.0
        avg_tokens = float(agg_row["avg_tokens"]) if agg_row else 0.0
        avg_response_time = float(agg_row["avg_response_time"]) if agg_row else 0.0
        avg_satisfaction = float(agg_row["avg_satisfaction"]) if agg_row else 0.0

        agent_rows = await execute(
            """
            SELECT
                agent_id,
                COUNT(*) AS thread_count,
                COALESCE(AVG(total_messages), 0) AS avg_messages
            FROM thread_analytics_v2
            WHERE user_id::text = :user_id AND agent_id IS NOT NULL
            GROUP BY agent_id
            ORDER BY thread_count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        agent_breakdown = [
            {
                "agent_id": r["agent_id"],
                "thread_count": int(r["thread_count"]),
                "avg_messages": round(float(r["avg_messages"]), 1),
            }
            for r in (agent_rows or [])
        ]

        return {
            "total_threads": total_threads,
            "avg_messages": round(avg_messages, 1),
            "avg_tokens": round(avg_tokens, 1),
            "avg_response_time": round(avg_response_time, 1),
            "avg_satisfaction": round(avg_satisfaction, 2),
            "agent_breakdown": agent_breakdown,
        }
    except Exception as exc:
        logger.error(f"get_analytics_summary error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics summary")


@router.get(
    "/analytics/trends",
    summary="Get thread analytics trends over last 30 days",
    operation_id="get_thread_analytics_trends_v2",
)
async def get_analytics_trends(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Daily thread counts and avg satisfaction over the last 30 days."""
    try:
        rows = await execute(
            """
            SELECT
                DATE(created_at)::TEXT AS date,
                COUNT(*) AS thread_count,
                COALESCE(AVG(user_satisfaction_score), 0) AS avg_satisfaction
            FROM thread_analytics_v2
            WHERE user_id::text = :user_id
              AND created_at >= now() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
            """,
            {"user_id": user_id},
        )

        return [
            {
                "date": r["date"],
                "thread_count": int(r["thread_count"]),
                "avg_satisfaction": round(float(r["avg_satisfaction"]), 2),
            }
            for r in (rows or [])
        ]
    except Exception as exc:
        logger.error(f"get_analytics_trends error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics trends")


@router.get(
    "/analytics/top-threads",
    summary="Get top threads by message count",
    operation_id="get_top_threads_v2",
)
async def get_top_threads(
    limit: int = Query(default=10, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Top threads ordered by total_messages descending."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_analytics_v2
            WHERE user_id::text = :user_id
            ORDER BY total_messages DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"get_top_threads_v2 error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch top threads")


# ============================================================================
# Per-thread endpoints — parameterized, AFTER static routes
# ============================================================================


@router.post(
    "/threads/{thread_id}/analytics",
    summary="Upsert thread analytics",
    operation_id="upsert_thread_analytics_v2",
)
async def upsert_thread_analytics(
    thread_id: str,
    body: UpsertThreadAnalyticsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Insert or update analytics for a thread (upsert on user_id + thread_id)."""
    try:
        raw = body.model_dump(exclude_none=True)
        # Build dynamic SET clause for update
        update_parts: List[str] = ["updated_at = now()"]
        for k in raw:
            update_parts.append(f"{k} = EXCLUDED.{k}")

        row = await execute_one(
            """
            INSERT INTO thread_analytics_v2
              (id, user_id, thread_id, agent_id, total_messages, user_messages,
               agent_messages, total_tokens, avg_response_time_ms, session_duration_ms,
               user_satisfaction_score, completion_rate, created_at, updated_at)
            VALUES
              (:id, :user_id, :thread_id, :agent_id, :total_messages, :user_messages,
               :agent_messages, :total_tokens, :avg_response_time_ms, :session_duration_ms,
               :user_satisfaction_score, :completion_rate, now(), now())
            ON CONFLICT (user_id, thread_id) DO UPDATE SET
              agent_id = COALESCE(EXCLUDED.agent_id, thread_analytics_v2.agent_id),
              total_messages = COALESCE(EXCLUDED.total_messages, thread_analytics_v2.total_messages),
              user_messages = COALESCE(EXCLUDED.user_messages, thread_analytics_v2.user_messages),
              agent_messages = COALESCE(EXCLUDED.agent_messages, thread_analytics_v2.agent_messages),
              total_tokens = COALESCE(EXCLUDED.total_tokens, thread_analytics_v2.total_tokens),
              avg_response_time_ms = COALESCE(EXCLUDED.avg_response_time_ms, thread_analytics_v2.avg_response_time_ms),
              session_duration_ms = COALESCE(EXCLUDED.session_duration_ms, thread_analytics_v2.session_duration_ms),
              user_satisfaction_score = COALESCE(EXCLUDED.user_satisfaction_score, thread_analytics_v2.user_satisfaction_score),
              completion_rate = COALESCE(EXCLUDED.completion_rate, thread_analytics_v2.completion_rate),
              updated_at = now()
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "thread_id": thread_id,
                "agent_id": raw.get("agent_id"),
                "total_messages": raw.get("total_messages", 0),
                "user_messages": raw.get("user_messages", 0),
                "agent_messages": raw.get("agent_messages", 0),
                "total_tokens": raw.get("total_tokens", 0),
                "avg_response_time_ms": raw.get("avg_response_time_ms", 0),
                "session_duration_ms": raw.get("session_duration_ms", 0),
                "user_satisfaction_score": raw.get("user_satisfaction_score"),
                "completion_rate": raw.get("completion_rate", 0),
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"upsert_thread_analytics error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to upsert thread analytics")


@router.get(
    "/threads/{thread_id}/analytics",
    summary="Get thread analytics (v2)",
    operation_id="get_thread_analytics_detail_v2",
)
async def get_thread_analytics_detail(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get analytics record for a specific thread."""
    row = await execute_one(
        "SELECT * FROM thread_analytics_v2 WHERE thread_id::text = :thread_id AND user_id::text = :user_id",
        {"thread_id": thread_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analytics not found for this thread")
    return serialize_row(row)


@router.post(
    "/threads/{thread_id}/events",
    summary="Record thread event",
    operation_id="record_thread_event",
)
async def record_thread_event(
    thread_id: str,
    body: RecordEventRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record an event for a thread."""
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"event_type must be one of: {', '.join(sorted(VALID_EVENT_TYPES))}",
        )
    try:
        row = await execute_one(
            """
            INSERT INTO thread_events
              (id, user_id, thread_id, event_type, event_data, occurred_at)
            VALUES
              (:id, :user_id, :thread_id, :event_type, :event_data, now())
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "thread_id": thread_id,
                "event_type": body.event_type,
                "event_data": json.dumps(body.event_data or {}),
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"record_thread_event error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record event")


@router.get(
    "/threads/{thread_id}/events",
    summary="List thread events",
    operation_id="list_thread_events",
)
async def list_thread_events(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all events for a thread ordered by occurred_at ASC."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_events
            WHERE thread_id::text = :thread_id AND user_id::text = :user_id
            ORDER BY occurred_at ASC
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_thread_events error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list thread events")
