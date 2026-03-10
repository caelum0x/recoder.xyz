from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one

router = APIRouter(tags=["agent-quotas"])


class UpsertQuotaRequest(BaseModel):
    max_runs_per_day: Optional[int] = None
    max_tokens_per_day: Optional[int] = None
    max_cost_per_day: Optional[float] = None
    max_runs_per_month: Optional[int] = None
    max_tokens_per_month: Optional[int] = None
    max_cost_per_month: Optional[float] = None
    alert_threshold_pct: Optional[int] = 80
    is_enforced: Optional[bool] = False


async def _get_current_usage(agent_id: str, user_id: str) -> dict:
    """Get current daily and monthly usage from agent_analytics_daily table."""
    # Daily usage (today)
    daily_row = await execute_one(
        """
        SELECT
            COALESCE(SUM(total_runs), 0) AS runs_today,
            COALESCE(SUM(total_tokens_in + total_tokens_out), 0) AS tokens_today,
            COALESCE(SUM(total_cost), 0) AS cost_today
        FROM agent_analytics_daily
        WHERE agent_id = :agent_id
          AND date = CURRENT_DATE
        """,
        {"agent_id": agent_id},
    )

    # Monthly usage (current month)
    monthly_row = await execute_one(
        """
        SELECT
            COALESCE(SUM(total_runs), 0) AS runs_month,
            COALESCE(SUM(total_tokens_in + total_tokens_out), 0) AS tokens_month,
            COALESCE(SUM(total_cost), 0) AS cost_month
        FROM agent_analytics_daily
        WHERE agent_id = :agent_id
          AND date >= date_trunc('month', CURRENT_DATE)
        """,
        {"agent_id": agent_id},
    )

    return {
        "runs_today": int(daily_row["runs_today"]) if daily_row else 0,
        "tokens_today": int(daily_row["tokens_today"]) if daily_row else 0,
        "cost_today": float(daily_row["cost_today"]) if daily_row else 0.0,
        "runs_month": int(monthly_row["runs_month"]) if monthly_row else 0,
        "tokens_month": int(monthly_row["tokens_month"]) if monthly_row else 0,
        "cost_month": float(monthly_row["cost_month"]) if monthly_row else 0.0,
    }


def _compute_pct(current: float, limit: Optional[float]) -> Optional[float]:
    """Compute percentage used, or None if no limit is set."""
    if limit is None or limit <= 0:
        return None
    return round((current / limit) * 100, 1)


@router.get("/agents/{agent_id}/quota", summary="Get quota config + current usage")
async def get_agent_quota(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    quota_row = await execute_one(
        "SELECT * FROM agent_quotas WHERE agent_id = :agent_id AND user_id = :user_id",
        {"agent_id": agent_id, "user_id": user_id},
    )

    usage = await _get_current_usage(agent_id, user_id)

    quota = dict(quota_row) if quota_row else None

    # Compute percentage usage against limits
    if quota:
        usage["daily_runs_pct"] = _compute_pct(usage["runs_today"], quota.get("max_runs_per_day"))
        usage["daily_tokens_pct"] = _compute_pct(usage["tokens_today"], quota.get("max_tokens_per_day"))
        usage["daily_cost_pct"] = _compute_pct(usage["cost_today"], quota.get("max_cost_per_day"))
        usage["monthly_runs_pct"] = _compute_pct(usage["runs_month"], quota.get("max_runs_per_month"))
        usage["monthly_tokens_pct"] = _compute_pct(usage["tokens_month"], quota.get("max_tokens_per_month"))
        usage["monthly_cost_pct"] = _compute_pct(usage["cost_month"], quota.get("max_cost_per_month"))

    return {
        "quota": quota,
        "usage": usage,
    }


@router.put("/agents/{agent_id}/quota", summary="Set/update agent quota")
async def upsert_agent_quota(
    agent_id: str,
    body: UpsertQuotaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        INSERT INTO agent_quotas (
            agent_id, user_id,
            max_runs_per_day, max_tokens_per_day, max_cost_per_day,
            max_runs_per_month, max_tokens_per_month, max_cost_per_month,
            alert_threshold_pct, is_enforced
        ) VALUES (
            :agent_id, :user_id,
            :max_runs_per_day, :max_tokens_per_day, :max_cost_per_day,
            :max_runs_per_month, :max_tokens_per_month, :max_cost_per_month,
            :alert_threshold_pct, :is_enforced
        )
        ON CONFLICT (user_id, agent_id) DO UPDATE SET
            max_runs_per_day = EXCLUDED.max_runs_per_day,
            max_tokens_per_day = EXCLUDED.max_tokens_per_day,
            max_cost_per_day = EXCLUDED.max_cost_per_day,
            max_runs_per_month = EXCLUDED.max_runs_per_month,
            max_tokens_per_month = EXCLUDED.max_tokens_per_month,
            max_cost_per_month = EXCLUDED.max_cost_per_month,
            alert_threshold_pct = EXCLUDED.alert_threshold_pct,
            is_enforced = EXCLUDED.is_enforced,
            updated_at = now()
        RETURNING *
        """,
        {
            "agent_id": agent_id,
            "user_id": user_id,
            "max_runs_per_day": body.max_runs_per_day,
            "max_tokens_per_day": body.max_tokens_per_day,
            "max_cost_per_day": body.max_cost_per_day,
            "max_runs_per_month": body.max_runs_per_month,
            "max_tokens_per_month": body.max_tokens_per_month,
            "max_cost_per_month": body.max_cost_per_month,
            "alert_threshold_pct": body.alert_threshold_pct,
            "is_enforced": body.is_enforced,
        },
    )
    return dict(row)


@router.delete("/agents/{agent_id}/quota", summary="Remove agent quota")
async def delete_agent_quota(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM agent_quotas WHERE agent_id = :agent_id AND user_id = :user_id",
        {"agent_id": agent_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.get("/agents/quotas/overview", summary="All agents with quota status")
async def get_quotas_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Get all agents with their quotas (left join so we include agents without quotas)
    rows = await execute(
        """
        SELECT
            a.agent_id,
            a.name AS agent_name,
            q.max_runs_per_day,
            q.max_tokens_per_day,
            q.max_cost_per_day,
            q.max_runs_per_month,
            q.max_tokens_per_month,
            q.max_cost_per_month,
            q.alert_threshold_pct,
            q.is_enforced,
            COALESCE(d.runs_today, 0) AS runs_today,
            COALESCE(d.tokens_today, 0) AS tokens_today,
            COALESCE(d.cost_today, 0) AS cost_today,
            COALESCE(m.runs_month, 0) AS runs_month,
            COALESCE(m.tokens_month, 0) AS tokens_month,
            COALESCE(m.cost_month, 0) AS cost_month
        FROM agents a
        LEFT JOIN agent_quotas q ON q.agent_id = a.agent_id AND q.user_id = :user_id
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_runs) AS runs_today,
                SUM(total_tokens_in + total_tokens_out) AS tokens_today,
                SUM(total_cost) AS cost_today
            FROM agent_analytics_daily
            WHERE agent_id = a.agent_id AND date = CURRENT_DATE
        ) d ON true
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_runs) AS runs_month,
                SUM(total_tokens_in + total_tokens_out) AS tokens_month,
                SUM(total_cost) AS cost_month
            FROM agent_analytics_daily
            WHERE agent_id = a.agent_id AND date >= date_trunc('month', CURRENT_DATE)
        ) m ON true
        WHERE a.account_id = :user_id
        ORDER BY a.name
        """,
        {"user_id": user_id},
    )

    results = []
    for row in rows:
        r = dict(row)
        # Compute percentage usage
        r["daily_runs_pct"] = _compute_pct(float(r["runs_today"]), r.get("max_runs_per_day"))
        r["daily_tokens_pct"] = _compute_pct(float(r["tokens_today"]), r.get("max_tokens_per_day"))
        r["daily_cost_pct"] = _compute_pct(float(r["cost_today"]), r.get("max_cost_per_day"))
        r["monthly_runs_pct"] = _compute_pct(float(r["runs_month"]), r.get("max_runs_per_month"))
        r["monthly_tokens_pct"] = _compute_pct(float(r["tokens_month"]), r.get("max_tokens_per_month"))
        r["monthly_cost_pct"] = _compute_pct(float(r["cost_month"]), r.get("max_cost_per_month"))
        r["has_quota"] = r.get("max_runs_per_day") is not None or r.get("max_runs_per_month") is not None
        results.append(r)

    return results


@router.get("/agents/quotas/alerts", summary="Agents approaching or exceeding limits")
async def get_quota_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Get all quotas with current usage, filtered to those approaching limits
    rows = await execute(
        """
        SELECT
            q.agent_id,
            a.name AS agent_name,
            q.max_runs_per_day,
            q.max_tokens_per_day,
            q.max_cost_per_day,
            q.max_runs_per_month,
            q.max_tokens_per_month,
            q.max_cost_per_month,
            q.alert_threshold_pct,
            q.is_enforced,
            COALESCE(d.runs_today, 0) AS runs_today,
            COALESCE(d.tokens_today, 0) AS tokens_today,
            COALESCE(d.cost_today, 0) AS cost_today,
            COALESCE(m.runs_month, 0) AS runs_month,
            COALESCE(m.tokens_month, 0) AS tokens_month,
            COALESCE(m.cost_month, 0) AS cost_month
        FROM agent_quotas q
        JOIN agents a ON a.agent_id = q.agent_id
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_runs) AS runs_today,
                SUM(total_tokens_in + total_tokens_out) AS tokens_today,
                SUM(total_cost) AS cost_today
            FROM agent_analytics_daily
            WHERE agent_id = q.agent_id AND date = CURRENT_DATE
        ) d ON true
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_runs) AS runs_month,
                SUM(total_tokens_in + total_tokens_out) AS tokens_month,
                SUM(total_cost) AS cost_month
            FROM agent_analytics_daily
            WHERE agent_id = q.agent_id AND date >= date_trunc('month', CURRENT_DATE)
        ) m ON true
        WHERE q.user_id = :user_id
        ORDER BY a.name
        """,
        {"user_id": user_id},
    )

    alerts = []
    for row in rows:
        r = dict(row)
        threshold = r.get("alert_threshold_pct", 80) or 80

        # Check which limits are approaching/exceeded
        alert_items = []

        for label, current_key, limit_key, period in [
            ("Daily Runs", "runs_today", "max_runs_per_day", "daily"),
            ("Daily Tokens", "tokens_today", "max_tokens_per_day", "daily"),
            ("Daily Cost", "cost_today", "max_cost_per_day", "daily"),
            ("Monthly Runs", "runs_month", "max_runs_per_month", "monthly"),
            ("Monthly Tokens", "tokens_month", "max_tokens_per_month", "monthly"),
            ("Monthly Cost", "cost_month", "max_cost_per_month", "monthly"),
        ]:
            limit = r.get(limit_key)
            if limit is not None and float(limit) > 0:
                current = float(r[current_key])
                pct = (current / float(limit)) * 100
                if pct >= threshold:
                    alert_items.append({
                        "metric": label,
                        "period": period,
                        "current": current,
                        "limit": float(limit),
                        "pct": round(pct, 1),
                        "exceeded": pct >= 100,
                    })

        if alert_items:
            alerts.append({
                "agent_id": r["agent_id"],
                "agent_name": r["agent_name"],
                "is_enforced": r["is_enforced"],
                "alert_threshold_pct": threshold,
                "alerts": alert_items,
            })

    return alerts
