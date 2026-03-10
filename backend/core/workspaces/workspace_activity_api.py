"""
Workspace Activity Feed API.

Records and queries workspace-level activity events (agent CRUD, runs, config changes, etc.).
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/workspaces", tags=["workspace-activity"])


# ============================================================================
# Pydantic Models
# ============================================================================

VALID_ACTIVITY_TYPES = {
    "agent_created", "agent_updated", "agent_deleted",
    "thread_started", "thread_completed",
    "run_started", "run_completed", "run_failed",
    "member_joined", "member_left",
    "config_changed", "deploy_completed",
}


class RecordActivityRequest(BaseModel):
    workspace_id: Optional[str] = None
    activity_type: str = Field(..., description="One of the valid activity types")
    actor_name: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/activity", summary="List workspace activity feed")
async def list_activity(
    workspace_id: Optional[str] = Query(None),
    activity_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    conditions = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

    if workspace_id:
        conditions.append("workspace_id = :workspace_id")
        params["workspace_id"] = workspace_id

    if activity_type:
        if activity_type not in VALID_ACTIVITY_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid activity_type. Must be one of: {', '.join(sorted(VALID_ACTIVITY_TYPES))}",
            )
        conditions.append("activity_type = :activity_type")
        params["activity_type"] = activity_type

    where = " AND ".join(conditions)
    rows = await execute(
        f"""
        SELECT * FROM workspace_activity_feed
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )
    return serialize_rows([dict(r) for r in (rows or [])])


@router.post("/activity", summary="Record a workspace activity event")
async def record_activity(
    body: RecordActivityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.activity_type not in VALID_ACTIVITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid activity_type. Must be one of: {', '.join(sorted(VALID_ACTIVITY_TYPES))}",
        )

    try:
        row = await execute_one(
            """
            INSERT INTO workspace_activity_feed
                (user_id, workspace_id, activity_type, actor_name, target_type, target_id, target_name, metadata)
            VALUES
                (:user_id, :workspace_id, :activity_type, :actor_name, :target_type, :target_id, :target_name, :metadata)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "workspace_id": body.workspace_id,
                "activity_type": body.activity_type,
                "actor_name": body.actor_name,
                "target_type": body.target_type,
                "target_id": body.target_id,
                "target_name": body.target_name,
                "metadata": body.metadata or {},
            },
        )
        return serialize_row(dict(row))
    except Exception as e:
        logger.error(f"Failed to record activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to record activity")


@router.get("/activity/summary", summary="Activity summary for last 24h")
async def activity_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    try:
        # Count by type for last 24h
        type_counts_rows = await execute(
            """
            SELECT activity_type, COUNT(*) as count
            FROM workspace_activity_feed
            WHERE user_id = :user_id AND created_at >= now() - interval '24 hours'
            GROUP BY activity_type
            ORDER BY count DESC
            """,
            {"user_id": user_id},
        )
        type_counts = {
            r["activity_type"]: int(r["count"]) for r in (type_counts_rows or [])
        }

        # Most active agents (by target_name where target_type is 'agent')
        active_agents_rows = await execute(
            """
            SELECT target_name, COUNT(*) as count
            FROM workspace_activity_feed
            WHERE user_id = :user_id
              AND created_at >= now() - interval '24 hours'
              AND target_name IS NOT NULL
            GROUP BY target_name
            ORDER BY count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        most_active = [
            {"name": r["target_name"], "count": int(r["count"])}
            for r in (active_agents_rows or [])
        ]

        # Busiest hours
        busiest_hours_rows = await execute(
            """
            SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS count
            FROM workspace_activity_feed
            WHERE user_id = :user_id AND created_at >= now() - interval '24 hours'
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        busiest_hours = [
            {"hour": int(r["hour"]), "count": int(r["count"])}
            for r in (busiest_hours_rows or [])
        ]

        total_events = sum(type_counts.values())

        return {
            "total_events": total_events,
            "type_counts": type_counts,
            "most_active_agents": most_active,
            "busiest_hours": busiest_hours,
        }
    except Exception as e:
        logger.error(f"Failed to get activity summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity summary")


@router.get("/activity/timeline", summary="Hourly activity counts for charts")
async def activity_timeline(
    hours: int = Query(24, ge=1, le=168),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    try:
        rows = await execute(
            """
            SELECT
                date_trunc('hour', created_at) AS hour,
                COUNT(*) AS count
            FROM workspace_activity_feed
            WHERE user_id = :user_id
              AND created_at >= now() - make_interval(hours => :hours)
            GROUP BY hour
            ORDER BY hour ASC
            """,
            {"user_id": user_id, "hours": hours},
        )
        return [
            {
                "hour": r["hour"].isoformat() if hasattr(r["hour"], "isoformat") else str(r["hour"]),
                "count": int(r["count"]),
            }
            for r in (rows or [])
        ]
    except Exception as e:
        logger.error(f"Failed to get activity timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity timeline")
