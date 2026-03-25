"""
Activity Feed API endpoints.

Provides recording, listing, marking read, preferences, and stats for
user activity feed events.
Access control enforced at application layer (WHERE user_id::text = :user_id).
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["activity-feed"])


# ============================================================================
# Pydantic Models
# ============================================================================

VALID_EVENT_TYPES = (
    "agent_created",
    "agent_updated",
    "agent_deleted",
    "thread_started",
    "thread_completed",
    "deployment_created",
    "webhook_triggered",
    "error_detected",
    "benchmark_run",
    "template_used",
    "config_changed",
    "scheduled_task_run",
    "annotation_added",
)


class RecordActivityRequest(BaseModel):
    event_type: str
    resource_type: str
    resource_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class UpdatePreferencesRequest(BaseModel):
    muted_event_types: Optional[List[str]] = None
    show_read: Optional[bool] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/activity/events",
    summary="Record activity event",
    operation_id="record_activity_event",
)
async def record_activity_event(
    body: RecordActivityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a new activity feed event for the authenticated user."""
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event_type. Must be one of: {', '.join(VALID_EVENT_TYPES)}",
        )

    row = await execute_one(
        """
        INSERT INTO activity_feed_events
            (user_id, event_type, resource_type, resource_id, title, description, metadata)
        VALUES
            (:user_id, :event_type, :resource_type, :resource_id, :title, :description, :metadata::jsonb)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "event_type": body.event_type,
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "title": body.title,
            "description": body.description,
            "metadata": body.metadata or {},
        },
        commit=True,
    )

    return row


@router.get(
    "/activity/feed",
    summary="List activity feed events",
    operation_id="list_activity_feed",
)
async def list_activity_feed(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    event_type: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    List activity feed events for the authenticated user.
    Respects muted event types from user preferences.
    """
    # Fetch muted event types from preferences
    prefs_row = await execute_one(
        "SELECT muted_event_types, show_read FROM activity_feed_preferences WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )
    muted_types: List[str] = []
    show_read = True
    if prefs_row:
        muted_types = prefs_row.get("muted_event_types") or []
        show_read = prefs_row.get("show_read", True)

    where_clauses = ["user_id::text = :user_id"]
    params: Dict[str, Any] = {
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }

    if event_type:
        where_clauses.append("event_type = :event_type")
        params["event_type"] = event_type

    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type

    if unread_only or not show_read:
        where_clauses.append("is_read = false")

    # Filter out muted event types
    if muted_types:
        # Use a NOT IN with individual params to avoid array binding issues
        muted_placeholders = []
        for i, mt in enumerate(muted_types):
            key = f"muted_{i}"
            muted_placeholders.append(f":{key}")
            params[key] = mt
        where_clauses.append(f"event_type NOT IN ({', '.join(muted_placeholders)})")

    where_sql = " AND ".join(where_clauses)

    rows = await execute(
        f"""
        SELECT * FROM activity_feed_events
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    count_row = await execute_one(
        f"SELECT COUNT(*) FROM activity_feed_events WHERE {where_sql}",
        count_params,
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "items": serialize_rows(rows),
        "events": serialize_rows(rows),  # backward compat
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }


@router.post(
    "/activity/events/{event_id}/read",
    summary="Mark event as read",
    operation_id="mark_activity_read",
)
async def mark_activity_read(
    event_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a single activity event as read."""
    row = await execute_one(
        """
        UPDATE activity_feed_events
        SET is_read = true
        WHERE id = :event_id AND user_id::text = :user_id
        RETURNING id, is_read
        """,
        {"event_id": event_id, "user_id": user_id},
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    return row


@router.post(
    "/activity/events/mark-all-read",
    summary="Mark all events as read",
    operation_id="mark_all_activity_read",
)
async def mark_all_activity_read(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark all unread activity events as read for the authenticated user."""
    await execute_mutate(
        """
        UPDATE activity_feed_events
        SET is_read = true
        WHERE user_id::text = :user_id AND is_read = false
        """,
        {"user_id": user_id},
    )

    return {"success": True}


@router.get(
    "/activity/feed/preferences",
    summary="Get feed preferences",
    operation_id="get_activity_preferences",
)
async def get_activity_preferences(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the user's activity feed preferences."""
    row = await execute_one(
        "SELECT * FROM activity_feed_preferences WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )

    if not row:
        # Return defaults if no preferences exist yet
        return {
            "user_id": user_id,
            "muted_event_types": [],
            "show_read": True,
        }

    return row


@router.put(
    "/activity/feed/preferences",
    summary="Update feed preferences",
    operation_id="update_activity_preferences",
)
async def update_activity_preferences(
    body: UpdatePreferencesRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update (upsert) the user's activity feed preferences."""
    muted = body.muted_event_types if body.muted_event_types is not None else []
    show_read = body.show_read if body.show_read is not None else True

    # Validate muted event types
    for et in muted:
        if et not in VALID_EVENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid event type in muted_event_types: {et}",
            )

    row = await execute_one(
        """
        INSERT INTO activity_feed_preferences (user_id, muted_event_types, show_read)
        VALUES (:user_id, :muted_event_types, :show_read)
        ON CONFLICT (user_id) DO UPDATE SET
            muted_event_types = :muted_event_types,
            show_read = :show_read
        RETURNING *
        """,
        {
            "user_id": user_id,
            "muted_event_types": muted,
            "show_read": show_read,
        },
        commit=True,
    )

    return row


@router.get(
    "/activity/feed/stats",
    summary="Activity feed stats",
    operation_id="activity_feed_stats",
)
async def activity_feed_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get activity feed statistics:
    - unread_count: total unread events
    - events_per_type_today: breakdown of events by type for today
    - most_active_hour: hour of day with most events (last 7 days)
    """
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()

    # Unread count
    unread_row = await execute_one(
        """
        SELECT COUNT(*) FROM activity_feed_events
        WHERE user_id::text = :user_id AND is_read = false
        """,
        {"user_id": user_id},
    )
    unread_count = int(unread_row["count"]) if unread_row else 0

    # Events per type today
    type_rows = await execute(
        """
        SELECT event_type, COUNT(*) AS count
        FROM activity_feed_events
        WHERE user_id::text = :user_id AND created_at >= :today_start
        GROUP BY event_type
        ORDER BY count DESC
        """,
        {"user_id": user_id, "today_start": today_start},
    )

    events_today = sum(int(r.get("count", 0)) for r in type_rows) if type_rows else 0

    # Most active hour (last 7 days)
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    hour_row = await execute_one(
        """
        SELECT EXTRACT(HOUR FROM created_at)::INTEGER AS hour, COUNT(*) AS count
        FROM activity_feed_events
        WHERE user_id::text = :user_id AND created_at >= :since
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 1
        """,
        {"user_id": user_id, "since": since_7d},
    )

    most_active_hour = int(hour_row["hour"]) if hour_row else None

    return {
        "unread_count": unread_count,
        "events_today": events_today,
        "events_per_type_today": serialize_rows(type_rows),
        "most_active_hour": most_active_hour,
    }
