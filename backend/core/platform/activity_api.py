"""
Cross-app platform activity API.

Provides a unified activity feed aggregating events from all Recoder apps
(agents, agency, pm, web), plus summary stats for the unified dashboard.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/platform", tags=["platform-activity"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ActivityItem(BaseModel):
    id: str
    user_id: str
    app: str
    type: str
    title: str
    description: Optional[str] = None
    timestamp: str
    metadata: Dict[str, Any] = {}
    created_at: str


class ActivityFeedResponse(BaseModel):
    items: List[ActivityItem] = []
    total: int = 0
    has_more: bool = False


class PlatformStatsResponse(BaseModel):
    agent_count: int = 0
    threads_7d: int = 0
    workflow_count: int = 0
    runs_today: int = 0


class CreateActivityRequest(BaseModel):
    app: str = Field(..., description="Source app: agents, agency, pm, web")
    type: str = Field(..., description="Event type, e.g. agent_run, deploy, commit")
    title: str = Field(..., description="Short human-readable title")
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateActivityResponse(BaseModel):
    id: str
    created_at: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/activity", response_model=ActivityFeedResponse, summary="Get cross-app activity feed")
async def get_activity_feed(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=50, description="Number of items to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    app_filter: Optional[str] = Query(None, description="Filter by app: agents, agency, pm, web"),
):
    """
    Paginated activity feed for the authenticated user.
    Optionally filter by source app.
    """
    try:
        where_clauses = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id}

        if app_filter:
            if app_filter not in ("agents", "agency", "pm", "web"):
                raise HTTPException(status_code=400, detail="app_filter must be one of: agents, agency, pm, web")
            where_clauses.append("app = :app_filter")
            params["app_filter"] = app_filter

        where_sql = " AND ".join(where_clauses)

        # Get total count
        count_sql = f"SELECT COUNT(*) AS cnt FROM platform_activity WHERE {where_sql}"
        count_row = await execute_one(count_sql, params)
        total = count_row["cnt"] if count_row else 0

        # Fetch page
        params["limit"] = limit
        params["offset"] = offset
        items_sql = f"""
        SELECT id, user_id, app, type, title, description, timestamp, metadata, created_at
        FROM platform_activity
        WHERE {where_sql}
        ORDER BY timestamp DESC
        LIMIT :limit OFFSET :offset
        """
        rows = await execute(items_sql, params)

        items = [
            ActivityItem(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                app=row["app"],
                type=row["type"],
                title=row["title"],
                description=row.get("description"),
                timestamp=row["timestamp"].isoformat() if hasattr(row["timestamp"], "isoformat") else str(row["timestamp"]),
                metadata=row.get("metadata") or {},
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            )
            for row in (rows or [])
        ]

        return ActivityFeedResponse(
            items=items,
            total=total,
            has_more=(offset + limit) < total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching activity feed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity feed")


@router.get("/stats", response_model=PlatformStatsResponse, summary="Get platform summary stats")
async def get_platform_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Summary statistics across the platform for the authenticated user.
    Uses safe fallbacks if underlying tables don't exist yet.
    """
    stats = PlatformStatsResponse()

    # agent_count: total agents owned by this user
    try:
        row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM agents WHERE account_id = :user_id",
            {"user_id": user_id},
        )
        if row:
            stats.agent_count = row["cnt"]
    except Exception as e:
        logger.warning(f"platform stats: agents count failed: {e}")

    # threads_7d: threads created in the last 7 days
    try:
        row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM threads WHERE account_id = :user_id AND created_at >= NOW() - INTERVAL '7 days'",
            {"user_id": user_id},
        )
        if row:
            stats.threads_7d = row["cnt"]
    except Exception as e:
        logger.warning(f"platform stats: threads_7d count failed: {e}")

    # workflow_count: total workflows
    try:
        row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM workflows WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        if row:
            stats.workflow_count = row["cnt"]
    except Exception as e:
        logger.warning(f"platform stats: workflow_count failed: {e}")

    # runs_today: agent runs started today
    try:
        row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM agent_runs ar JOIN threads t ON ar.thread_id = t.thread_id WHERE t.account_id = :user_id AND ar.started_at >= CURRENT_DATE",
            {"user_id": user_id},
        )
        if row:
            stats.runs_today = row["cnt"]
    except Exception as e:
        logger.warning(f"platform stats: runs_today count failed: {e}")

    return stats


@router.post("/activity", response_model=CreateActivityResponse, summary="Record a platform activity event")
async def create_activity(
    body: CreateActivityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Record a cross-app activity event for the authenticated user.
    Intended for internal use by platform services.
    """
    try:
        if body.app not in ("agents", "agency", "pm", "web"):
            raise HTTPException(status_code=400, detail="app must be one of: agents, agency, pm, web")

        now = datetime.now(timezone.utc)

        sql = """
        INSERT INTO platform_activity (user_id, app, type, title, description, timestamp, metadata)
        VALUES (:user_id, :app, :type, :title, :description, :timestamp, :metadata)
        RETURNING id, created_at
        """
        row = await execute_one(sql, {
            "user_id": user_id,
            "app": body.app,
            "type": body.type,
            "title": body.title,
            "description": body.description,
            "timestamp": now,
            "metadata": body.metadata or {},
        }, commit=True)

        if not row:
            raise HTTPException(status_code=500, detail="Failed to insert activity record")

        return CreateActivityResponse(
            id=str(row["id"]),
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating activity event: {e}")
        raise HTTPException(status_code=500, detail="Failed to create activity event")
