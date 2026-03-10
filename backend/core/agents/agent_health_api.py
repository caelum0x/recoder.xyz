from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
import json

router = APIRouter(tags=["agent-health"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/agents/{agent_id}/health",
    summary="Get latest health score for an agent",
    operation_id="get_agent_health",
)
async def get_agent_health(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return the most recent health score for the given agent."""
    row = await execute_one(
        """
        SELECT * FROM agent_health_scores
        WHERE user_id = :user_id AND agent_id = :agent_id
        ORDER BY calculated_at DESC
        LIMIT 1
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    if not row:
        return {
            "agent_id": agent_id,
            "overall_score": None,
            "reliability_score": None,
            "performance_score": None,
            "cost_efficiency_score": None,
            "user_satisfaction_score": None,
            "factors": {},
            "calculated_at": None,
            "message": "No health score calculated yet. Click Recalculate to generate one.",
        }

    return dict(row)


@router.post(
    "/agents/{agent_id}/health/calculate",
    summary="Calculate health score from recent data",
    operation_id="calculate_agent_health",
)
async def calculate_agent_health(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Calculate a composite health score from recent agent run data.

    Weights:
      - reliability (success rate): 30%
      - performance (inverse latency): 25%
      - cost_efficiency (cost per successful run): 25%
      - user_satisfaction (avg rating): 20%
    """
    now = datetime.now(timezone.utc)
    period_start = now - timedelta(days=30)

    # --- Reliability: success rate from agent_runs ---
    reliability_row = await execute_one(
        """
        SELECT
            COUNT(*) AS total_runs,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0),
                2
            ) AS success_rate
        FROM agent_runs
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND started_at >= :period_start
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )

    total_runs = int(reliability_row["total_runs"]) if reliability_row and reliability_row["total_runs"] else 0
    success_rate = float(reliability_row["success_rate"]) if reliability_row and reliability_row["success_rate"] else 0.0
    reliability_score = min(100, int(round(success_rate)))

    # --- Performance: inverse latency score ---
    # Map average latency to 0-100: <=5s = 100, 5-30s linear, >=120s = 0
    perf_row = await execute_one(
        """
        SELECT
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))::NUMERIC AS avg_duration_s,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at))
            )::NUMERIC AS median_duration_s
        FROM agent_runs
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND started_at >= :period_start
          AND ended_at IS NOT NULL
          AND status = 'completed'
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )

    avg_duration_s = float(perf_row["avg_duration_s"]) if perf_row and perf_row["avg_duration_s"] else None
    if avg_duration_s is not None:
        if avg_duration_s <= 5:
            performance_score = 100
        elif avg_duration_s >= 120:
            performance_score = 0
        else:
            # Linear interpolation between 5s (100) and 120s (0)
            performance_score = int(round(100 * (1 - (avg_duration_s - 5) / 115)))
    else:
        performance_score = 50  # Default when no data

    # --- Cost Efficiency: cost per successful run ---
    # Map to 0-100: <=0.001 = 100, >=1.0 = 0
    cost_row = await execute_one(
        """
        SELECT
            AVG(cost)::NUMERIC(10,6) AS avg_cost,
            SUM(cost)::NUMERIC(10,6) AS total_cost,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs
        FROM agent_runs
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND started_at >= :period_start
          AND cost IS NOT NULL
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )

    completed_count = int(cost_row["completed_runs"]) if cost_row and cost_row["completed_runs"] else 0
    total_cost = float(cost_row["total_cost"]) if cost_row and cost_row["total_cost"] else 0.0
    cost_per_success = total_cost / completed_count if completed_count > 0 else None

    if cost_per_success is not None:
        if cost_per_success <= 0.001:
            cost_efficiency_score = 100
        elif cost_per_success >= 1.0:
            cost_efficiency_score = 0
        else:
            # Logarithmic scale: lower cost = higher score
            import math
            # Map log(0.001)=-3 to log(1.0)=0 linearly to 100-0
            log_cost = math.log10(max(cost_per_success, 0.0001))
            cost_efficiency_score = int(round(max(0, min(100, 100 * (0 - log_cost) / 3))))
    else:
        cost_efficiency_score = 50  # Default

    # --- User Satisfaction: avg rating from response_ratings ---
    satisfaction_row = await execute_one(
        """
        SELECT
            AVG(rating)::NUMERIC(3,2) AS avg_rating,
            COUNT(*) AS rating_count
        FROM response_ratings
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND created_at >= :period_start
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )

    avg_rating = float(satisfaction_row["avg_rating"]) if satisfaction_row and satisfaction_row["avg_rating"] else None
    rating_count = int(satisfaction_row["rating_count"]) if satisfaction_row and satisfaction_row["rating_count"] else 0

    if avg_rating is not None and rating_count > 0:
        # Ratings are typically 1-5, map to 0-100
        user_satisfaction_score = int(round((avg_rating - 1) * 25))
        user_satisfaction_score = max(0, min(100, user_satisfaction_score))
    else:
        user_satisfaction_score = 50  # Default when no ratings

    # --- Composite Score ---
    overall_score = int(round(
        reliability_score * 0.30 +
        performance_score * 0.25 +
        cost_efficiency_score * 0.25 +
        user_satisfaction_score * 0.20
    ))
    overall_score = max(0, min(100, overall_score))

    # Build factors breakdown
    factors = {
        "reliability": {
            "score": reliability_score,
            "weight": 0.30,
            "total_runs": total_runs,
            "success_rate": success_rate,
        },
        "performance": {
            "score": performance_score,
            "weight": 0.25,
            "avg_duration_s": round(avg_duration_s, 2) if avg_duration_s else None,
        },
        "cost_efficiency": {
            "score": cost_efficiency_score,
            "weight": 0.25,
            "cost_per_success": round(cost_per_success, 6) if cost_per_success else None,
            "total_cost": round(total_cost, 6),
        },
        "user_satisfaction": {
            "score": user_satisfaction_score,
            "weight": 0.20,
            "avg_rating": round(avg_rating, 2) if avg_rating else None,
            "rating_count": rating_count,
        },
    }

    # Store the result
    row = await execute_one(
        """
        INSERT INTO agent_health_scores (
            user_id, agent_id, overall_score,
            reliability_score, performance_score,
            cost_efficiency_score, user_satisfaction_score,
            factors, calculated_at
        ) VALUES (
            :user_id, :agent_id, :overall_score,
            :reliability_score, :performance_score,
            :cost_efficiency_score, :user_satisfaction_score,
            :factors, :calculated_at
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "overall_score": overall_score,
            "reliability_score": reliability_score,
            "performance_score": performance_score,
            "cost_efficiency_score": cost_efficiency_score,
            "user_satisfaction_score": user_satisfaction_score,
            "factors": json.dumps(factors),
            "calculated_at": now.isoformat(),
        },
    )

    return dict(row)


@router.get(
    "/agents/{agent_id}/health/history",
    summary="Health score history for an agent",
    operation_id="get_agent_health_history",
)
async def get_agent_health_history(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(30, ge=1, le=100),
):
    """Return health score trend over time, most recent first."""
    rows = await execute(
        """
        SELECT
            id, overall_score, reliability_score, performance_score,
            cost_efficiency_score, user_satisfaction_score,
            factors, calculated_at
        FROM agent_health_scores
        WHERE user_id = :user_id AND agent_id = :agent_id
        ORDER BY calculated_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "agent_id": agent_id, "limit": limit},
    )

    return {
        "agent_id": agent_id,
        "history": [dict(r) for r in rows],
        "count": len(rows),
    }


@router.get(
    "/agents/health/overview",
    summary="Health overview for all agents",
    operation_id="get_agents_health_overview",
)
async def get_agents_health_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Return the latest health score for every agent belonging to this user.
    Uses DISTINCT ON to pick the most recent calculated_at per agent.
    """
    rows = await execute(
        """
        SELECT DISTINCT ON (agent_id)
            id, agent_id, overall_score, reliability_score,
            performance_score, cost_efficiency_score,
            user_satisfaction_score, factors, calculated_at
        FROM agent_health_scores
        WHERE user_id = :user_id
        ORDER BY agent_id, calculated_at DESC
        """,
        {"user_id": user_id},
    )

    return {
        "agents": [dict(r) for r in rows],
        "total": len(rows),
    }
