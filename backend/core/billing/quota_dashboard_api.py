"""
Quota Dashboard API.

Provides endpoints for daily usage breakdowns, quota summaries against limits,
linear forecasting, and top consumer analysis. Powers the visual Usage Quotas
dashboard in the frontend.
"""

from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional
import math
import calendar

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/quota", tags=["quota-dashboard"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class DailyUsageEntry(BaseModel):
    date: str
    run_count: int
    token_count: int
    cost: float
    error_count: int
    agent_id: Optional[str] = None


class UsageSummaryResponse(BaseModel):
    period_start: str
    period_end: str
    runs_used: int
    runs_limit: Optional[int] = None
    runs_pct: float = 0
    tokens_used: int
    tokens_limit: Optional[int] = None
    tokens_pct: float = 0
    cost_used: float
    cost_limit: Optional[float] = None
    cost_pct: float = 0


class ForecastResponse(BaseModel):
    period_start: str
    period_end: str
    days_elapsed: int
    days_remaining: int
    current_runs: int
    projected_runs: int
    runs_limit: Optional[int] = None
    runs_over_limit: bool = False
    current_tokens: int
    projected_tokens: int
    tokens_limit: Optional[int] = None
    tokens_over_limit: bool = False
    current_cost: float
    projected_cost: float
    cost_limit: Optional[float] = None
    cost_over_limit: bool = False


class TopConsumerEntry(BaseModel):
    agent_id: str
    agent_name: Optional[str] = None
    run_count: int
    token_count: int
    cost: float
    pct_of_total: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _safe_pct(used: float, limit: Optional[float]) -> float:
    if limit is None or limit <= 0:
        return 0
    return round(min((used / limit) * 100, 100), 2)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/usage/daily",
    summary="Daily usage for last N days",
    operation_id="get_quota_usage_daily",
)
async def get_quota_usage_daily(
    days: int = Query(30, ge=1, le=365, description="Number of days"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Returns daily usage entries for the last N days.
    Can be filtered by agent_id for per-agent breakdown.
    """
    try:
        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=days)).date()

        where = "user_id::text = :user_id AND date >= :start_date"
        params: Dict[str, Any] = {
            "user_id": user_id,
            "start_date": start_date.isoformat(),
        }

        if agent_id:
            where += " AND agent_id::text = :agent_id"
            params["agent_id"] = agent_id

        rows = await execute(
            f"""
            SELECT date, agent_id,
                   COALESCE(run_count, 0) AS run_count,
                   COALESCE(token_count, 0) AS token_count,
                   COALESCE(cost, 0) AS cost,
                   COALESCE(error_count, 0) AS error_count
            FROM quota_usage_daily
            WHERE {where}
            ORDER BY date ASC
            """,
            params,
        )

        entries = [
            DailyUsageEntry(
                date=_ts(r["date"]),
                run_count=int(r["run_count"]),
                token_count=int(r["token_count"]),
                cost=float(r["cost"]),
                error_count=int(r["error_count"]),
                agent_id=r.get("agent_id"),
            ).model_dump()
            for r in (rows or [])
        ]

        return {"days": days, "entries": entries, "total": len(entries)}

    except Exception as e:
        logger.error(f"Error fetching daily quota usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch daily usage")


@router.get(
    "/usage/summary",
    summary="Current period usage vs limits",
    operation_id="get_quota_usage_summary",
)
async def get_quota_usage_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Aggregates this month's usage and compares against quota limits
    from agent_quotas table (if present).
    """
    try:
        now = datetime.now(timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day = calendar.monthrange(now.year, now.month)[1]
        period_end = now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999999)

        # Aggregate usage for current month
        agg = await execute_one(
            """
            SELECT
                COALESCE(SUM(run_count), 0) AS total_runs,
                COALESCE(SUM(token_count), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS total_cost
            FROM quota_usage_daily
            WHERE user_id::text = :user_id
              AND date >= :period_start
              AND date <= :period_end
            """,
            {
                "user_id": user_id,
                "period_start": period_start.date().isoformat(),
                "period_end": period_end.date().isoformat(),
            },
        )

        runs_used = int(agg["total_runs"]) if agg else 0
        tokens_used = int(agg["total_tokens"]) if agg else 0
        cost_used = float(agg["total_cost"]) if agg else 0

        # Try to fetch limits from agent_quotas (global user quotas)
        runs_limit = None
        tokens_limit = None
        cost_limit = None

        try:
            limits = await execute_one(
                """
                SELECT
                    COALESCE(SUM(max_runs_per_month), 0) AS total_run_limit,
                    COALESCE(SUM(max_tokens_per_month), 0) AS total_token_limit,
                    COALESCE(SUM(max_cost_per_month), 0) AS total_cost_limit
                FROM agent_quotas
                WHERE user_id::text = :user_id AND active = true
                """,
                {"user_id": user_id},
            )
            if limits:
                rl = int(limits["total_run_limit"])
                tl = int(limits["total_token_limit"])
                cl = float(limits["total_cost_limit"])
                if rl > 0:
                    runs_limit = rl
                if tl > 0:
                    tokens_limit = tl
                if cl > 0:
                    cost_limit = cl
        except Exception:
            # agent_quotas table may not exist yet — degrade gracefully
            pass

        return UsageSummaryResponse(
            period_start=period_start.date().isoformat(),
            period_end=period_end.date().isoformat(),
            runs_used=runs_used,
            runs_limit=runs_limit,
            runs_pct=_safe_pct(runs_used, runs_limit),
            tokens_used=tokens_used,
            tokens_limit=tokens_limit,
            tokens_pct=_safe_pct(tokens_used, tokens_limit),
            cost_used=cost_used,
            cost_limit=cost_limit,
            cost_pct=_safe_pct(cost_used, cost_limit),
        ).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching quota usage summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage summary")


@router.get(
    "/forecast",
    summary="Forecast end-of-month usage",
    operation_id="get_quota_forecast",
)
async def get_quota_forecast(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Linear extrapolation: projects end-of-month usage based on
    the daily average rate so far this month.
    """
    try:
        now = datetime.now(timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day = calendar.monthrange(now.year, now.month)[1]
        period_end = now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999999)

        days_elapsed = max(1, (now.date() - period_start.date()).days + 1)
        days_remaining = max(0, (period_end.date() - now.date()).days)
        total_days = days_elapsed + days_remaining

        # Aggregate current month
        agg = await execute_one(
            """
            SELECT
                COALESCE(SUM(run_count), 0) AS total_runs,
                COALESCE(SUM(token_count), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS total_cost
            FROM quota_usage_daily
            WHERE user_id::text = :user_id
              AND date >= :period_start
              AND date <= :period_end
            """,
            {
                "user_id": user_id,
                "period_start": period_start.date().isoformat(),
                "period_end": period_end.date().isoformat(),
            },
        )

        current_runs = int(agg["total_runs"]) if agg else 0
        current_tokens = int(agg["total_tokens"]) if agg else 0
        current_cost = float(agg["total_cost"]) if agg else 0

        # Linear projection
        daily_run_rate = current_runs / days_elapsed
        daily_token_rate = current_tokens / days_elapsed
        daily_cost_rate = current_cost / days_elapsed

        projected_runs = math.ceil(daily_run_rate * total_days)
        projected_tokens = math.ceil(daily_token_rate * total_days)
        projected_cost = round(daily_cost_rate * total_days, 6)

        # Fetch limits
        runs_limit = None
        tokens_limit = None
        cost_limit = None

        try:
            limits = await execute_one(
                """
                SELECT
                    COALESCE(SUM(max_runs_per_month), 0) AS total_run_limit,
                    COALESCE(SUM(max_tokens_per_month), 0) AS total_token_limit,
                    COALESCE(SUM(max_cost_per_month), 0) AS total_cost_limit
                FROM agent_quotas
                WHERE user_id::text = :user_id AND active = true
                """,
                {"user_id": user_id},
            )
            if limits:
                rl = int(limits["total_run_limit"])
                tl = int(limits["total_token_limit"])
                cl = float(limits["total_cost_limit"])
                if rl > 0:
                    runs_limit = rl
                if tl > 0:
                    tokens_limit = tl
                if cl > 0:
                    cost_limit = cl
        except Exception:
            pass

        return ForecastResponse(
            period_start=period_start.date().isoformat(),
            period_end=period_end.date().isoformat(),
            days_elapsed=days_elapsed,
            days_remaining=days_remaining,
            current_runs=current_runs,
            projected_runs=projected_runs,
            runs_limit=runs_limit,
            runs_over_limit=(runs_limit is not None and projected_runs > runs_limit),
            current_tokens=current_tokens,
            projected_tokens=projected_tokens,
            tokens_limit=tokens_limit,
            tokens_over_limit=(tokens_limit is not None and projected_tokens > tokens_limit),
            current_cost=current_cost,
            projected_cost=projected_cost,
            cost_limit=cost_limit,
            cost_over_limit=(cost_limit is not None and projected_cost > cost_limit),
        ).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching quota forecast: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch forecast")


@router.get(
    "/top-consumers",
    summary="Top agents by usage",
    operation_id="get_top_consumers",
)
async def get_top_consumers(
    metric: str = Query("runs", description="Metric to sort by: runs, tokens, cost"),
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Returns the top agents ranked by the chosen metric for the current month.
    """
    try:
        valid_metrics = {"runs", "tokens", "cost"}
        if metric not in valid_metrics:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metric. Must be one of: {', '.join(sorted(valid_metrics))}",
            )

        now = datetime.now(timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        order_col = {
            "runs": "total_runs",
            "tokens": "total_tokens",
            "cost": "total_cost",
        }[metric]

        rows = await execute(
            f"""
            SELECT
                q.agent_id,
                COALESCE(SUM(q.run_count), 0) AS total_runs,
                COALESCE(SUM(q.token_count), 0) AS total_tokens,
                COALESCE(SUM(q.cost), 0) AS total_cost
            FROM quota_usage_daily q
            WHERE q.user_id::text = :user_id
              AND q.date >= :period_start
              AND q.agent_id IS NOT NULL
            GROUP BY q.agent_id
            ORDER BY {order_col} DESC
            LIMIT :limit
            """,
            {
                "user_id": user_id,
                "period_start": period_start.date().isoformat(),
                "limit": limit,
            },
        )

        if not rows:
            return {"metric": metric, "consumers": []}

        # Compute totals for percentage calculation
        total_runs_all = sum(int(r["total_runs"]) for r in rows)
        total_tokens_all = sum(int(r["total_tokens"]) for r in rows)
        total_cost_all = sum(float(r["total_cost"]) for r in rows)

        # Try to get agent names
        agent_ids = [r["agent_id"] for r in rows]
        agent_names: Dict[str, str] = {}
        try:
            if agent_ids:
                # Build parameterized query for agent names
                placeholders = ", ".join(f":aid_{i}" for i in range(len(agent_ids)))
                name_params = {f"aid_{i}": aid for i, aid in enumerate(agent_ids)}
                name_rows = await execute(
                    f"SELECT agent_id, name FROM agents WHERE agent_id IN ({placeholders})",
                    name_params,
                )
                for nr in (name_rows or []):
                    agent_names[nr["agent_id"]] = nr["name"]
        except Exception:
            pass

        def pct_of(r: dict) -> float:
            if metric == "runs":
                return round((int(r["total_runs"]) / max(1, total_runs_all)) * 100, 2)
            elif metric == "tokens":
                return round((int(r["total_tokens"]) / max(1, total_tokens_all)) * 100, 2)
            else:
                return round((float(r["total_cost"]) / max(0.0001, total_cost_all)) * 100, 2)

        consumers = [
            TopConsumerEntry(
                agent_id=r["agent_id"],
                agent_name=agent_names.get(r["agent_id"]),
                run_count=int(r["total_runs"]),
                token_count=int(r["total_tokens"]),
                cost=round(float(r["total_cost"]), 6),
                pct_of_total=pct_of(r),
            ).model_dump()
            for r in rows
        ]

        return {"metric": metric, "consumers": consumers}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching top consumers: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch top consumers")
