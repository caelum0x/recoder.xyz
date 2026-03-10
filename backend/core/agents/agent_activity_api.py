from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import asyncio
import json

router = APIRouter(tags=["agent-activity"])


# ---------------------------------------------------------------------------
# Fire-and-forget activity logger
# ---------------------------------------------------------------------------

async def log_agent_activity(
    user_id: str,
    agent_id: str,
    activity_type: str,
    description: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Log an agent activity event. Runs as fire-and-forget — errors are swallowed."""
    try:
        await execute_one(
            """
            INSERT INTO agent_activity (user_id, agent_id, activity_type, description, metadata)
            VALUES (:user_id, :agent_id, :activity_type, :description, :metadata)
            RETURNING id
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "activity_type": activity_type,
                "description": description,
                "metadata": json.dumps(metadata or {}),
            },
        )
    except Exception as e:
        logger.warning(f"Failed to log agent activity: {e}")


def fire_and_forget_activity(
    user_id: str,
    agent_id: str,
    activity_type: str,
    description: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Schedule activity logging as a background task. Non-blocking."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(
            log_agent_activity(user_id, agent_id, activity_type, description, metadata)
        )
    except RuntimeError:
        # No running event loop — skip silently
        logger.debug("No event loop available for fire-and-forget activity logging")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/agents/{agent_id}/activity", summary="Get agent activity feed")
async def get_agent_activity(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    activity_type: Optional[str] = Query(None),
):
    """Paginated activity feed for a specific agent."""
    where = "user_id = :user_id AND agent_id = :agent_id"
    params: dict = {
        "user_id": user_id,
        "agent_id": agent_id,
        "limit": limit,
        "offset": offset,
    }

    if activity_type:
        where += " AND activity_type = :activity_type"
        params["activity_type"] = activity_type

    rows = await execute(
        f"""
        SELECT * FROM agent_activity
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) FROM agent_activity WHERE {where}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "activities": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/agents/activity/recent", summary="Get recent activity across all agents")
async def get_recent_activity(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100),
):
    """Last N activities across all of the user's agents, with agent name."""
    rows = await execute(
        """
        SELECT aa.*, a.name AS agent_name
        FROM agent_activity aa
        LEFT JOIN agents a ON a.agent_id::text = aa.agent_id
        WHERE aa.user_id = :user_id
        ORDER BY aa.created_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )
    return [dict(r) for r in rows]


@router.get("/agents/{agent_id}/activity/summary", summary="Activity summary for agent")
async def get_agent_activity_summary(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Count of activities by type for the last 30 days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    rows = await execute(
        """
        SELECT activity_type, COUNT(*) AS count
        FROM agent_activity
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND created_at >= :cutoff
        GROUP BY activity_type
        ORDER BY count DESC
        """,
        {"user_id": user_id, "agent_id": agent_id, "cutoff": cutoff},
    )

    summary: dict = {}
    total = 0
    runs = 0
    config_changes = 0
    errors = 0

    for r in rows:
        activity_type = r["activity_type"]
        count = int(r["count"])
        summary[activity_type] = count
        total += count

        if activity_type in ("run_started", "run_completed", "run_failed"):
            runs += count
        if activity_type in ("config_updated", "tool_added", "tool_removed"):
            config_changes += count
        if activity_type == "run_failed":
            errors += count

    return {
        "by_type": summary,
        "total": total,
        "runs": runs,
        "config_changes": config_changes,
        "errors": errors,
        "period_days": 30,
    }
