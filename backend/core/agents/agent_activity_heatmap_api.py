"""
Agent Activity Heatmap API

Provides daily activity data for GitHub-style contribution heatmaps:
- GET /agents/activity/heatmap — daily activity for last 365 days
- GET /agents/activity/streaks — current and longest streak
- POST /agents/activity/record — record/upsert daily activity
- GET /agents/activity/weekly-summary — last 4 weeks aggregated per week
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate

router = APIRouter(tags=["agent-activity-heatmap"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RecordActivityRequest(BaseModel):
    agent_id: str
    run_count: int = 0
    message_count: int = 0
    error_count: int = 0
    total_cost: float = 0.0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/agents/activity/heatmap", summary="Get daily activity heatmap data")
async def get_heatmap(
    agent_id: Optional[str] = Query(None, description="Filter by agent ID, omit for aggregate"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get daily activity for the last 365 days. Optionally filter by agent."""
    try:
        start_date = date.today() - timedelta(days=365)

        if agent_id:
            rows = await execute(
                """
                SELECT date, run_count, message_count, error_count, total_cost
                FROM agent_activity_daily
                WHERE user_id::text = :user_id AND agent_id::text = :agent_id AND date >= :start_date
                ORDER BY date ASC
                """,
                {"user_id": user_id, "agent_id": agent_id, "start_date": start_date},
            )
        else:
            rows = await execute(
                """
                SELECT date,
                       SUM(run_count)::INTEGER AS run_count,
                       SUM(message_count)::INTEGER AS message_count,
                       SUM(error_count)::INTEGER AS error_count,
                       SUM(total_cost)::NUMERIC AS total_cost
                FROM agent_activity_daily
                WHERE user_id::text = :user_id AND date >= :start_date
                GROUP BY date
                ORDER BY date ASC
                """,
                {"user_id": user_id, "start_date": start_date},
            )

        data = []
        for row in rows:
            d = row["date"]
            data.append({
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                "run_count": int(row.get("run_count") or 0),
                "message_count": int(row.get("message_count") or 0),
                "error_count": int(row.get("error_count") or 0),
                "total_cost": float(row.get("total_cost") or 0),
            })

        return {"days": data}

    except Exception as e:
        logger.error(f"Failed to get activity heatmap: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity heatmap")


@router.get("/agents/activity/streaks", summary="Get activity streak information")
async def get_streaks(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Calculate current consecutive-day streak and longest-ever streak."""
    try:
        rows = await execute(
            """
            SELECT DISTINCT date
            FROM agent_activity_daily
            WHERE user_id::text = :user_id AND run_count > 0
            ORDER BY date DESC
            """,
            {"user_id": user_id},
        )

        if not rows:
            return {"current_streak": 0, "longest_streak": 0}

        dates_set = set()
        for row in rows:
            d = row["date"]
            if hasattr(d, "isoformat"):
                dates_set.add(d)
            else:
                dates_set.add(date.fromisoformat(str(d)))

        # Current streak: count consecutive days backwards from today
        today = date.today()
        current_streak = 0
        check = today
        while check in dates_set:
            current_streak += 1
            check -= timedelta(days=1)

        # If today has no activity but yesterday does, start from yesterday
        if current_streak == 0:
            check = today - timedelta(days=1)
            while check in dates_set:
                current_streak += 1
                check -= timedelta(days=1)

        # Longest streak: scan all dates
        sorted_dates = sorted(dates_set)
        longest_streak = 0
        streak = 1
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] - sorted_dates[i - 1] == timedelta(days=1):
                streak += 1
            else:
                longest_streak = max(longest_streak, streak)
                streak = 1
        longest_streak = max(longest_streak, streak)

        return {"current_streak": current_streak, "longest_streak": longest_streak}

    except Exception as e:
        logger.error(f"Failed to get activity streaks: {e}")
        raise HTTPException(status_code=500, detail="Failed to get activity streaks")


@router.post("/agents/activity/record", summary="Record daily activity")
async def record_activity(
    body: RecordActivityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record or update daily activity for an agent (upsert by user_id + agent_id + date)."""
    try:
        rows = await execute_mutate(
            """
            INSERT INTO agent_activity_daily (user_id, agent_id, date, run_count, message_count, error_count, total_cost)
            VALUES (:user_id, :agent_id, CURRENT_DATE, :run_count, :message_count, :error_count, :total_cost)
            ON CONFLICT (user_id, agent_id, date) DO UPDATE SET
                run_count = agent_activity_daily.run_count + EXCLUDED.run_count,
                message_count = agent_activity_daily.message_count + EXCLUDED.message_count,
                error_count = agent_activity_daily.error_count + EXCLUDED.error_count,
                total_cost = agent_activity_daily.total_cost + EXCLUDED.total_cost
            RETURNING id, date
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "run_count": body.run_count,
                "message_count": body.message_count,
                "error_count": body.error_count,
                "total_cost": body.total_cost,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to record activity")

        d = rows[0]["date"]
        return {
            "success": True,
            "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to record activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to record activity")


@router.get("/agents/activity/weekly-summary", summary="Get weekly activity summary")
async def get_weekly_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregated activity per week for the last 4 weeks."""
    try:
        start_date = date.today() - timedelta(days=28)

        rows = await execute(
            """
            SELECT
                DATE_TRUNC('week', date)::DATE AS week_start,
                SUM(run_count)::INTEGER AS run_count,
                SUM(message_count)::INTEGER AS message_count,
                SUM(error_count)::INTEGER AS error_count,
                SUM(total_cost)::NUMERIC AS total_cost
            FROM agent_activity_daily
            WHERE user_id::text = :user_id AND date >= :start_date
            GROUP BY week_start
            ORDER BY week_start DESC
            """,
            {"user_id": user_id, "start_date": start_date},
        )

        weeks = []
        for row in rows:
            ws = row["week_start"]
            weeks.append({
                "week_start": ws.isoformat() if hasattr(ws, "isoformat") else str(ws),
                "run_count": int(row.get("run_count") or 0),
                "message_count": int(row.get("message_count") or 0),
                "error_count": int(row.get("error_count") or 0),
                "total_cost": float(row.get("total_cost") or 0),
            })

        return {"weeks": weeks}

    except Exception as e:
        logger.error(f"Failed to get weekly summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to get weekly summary")
