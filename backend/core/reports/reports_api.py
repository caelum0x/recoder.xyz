"""
Reports API endpoints.

Provides account-wide usage summaries, breakdowns by agent/model/day,
and CSV export for reporting dashboards. All queries filter by account_id
derived from the authenticated user's JWT.
"""

import csv
import io
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute
from core.utils.logger import logger

router = APIRouter(prefix="/reports", tags=["Reports"])


# ============================================================================
# Pydantic Models
# ============================================================================

class TopItem(BaseModel):
    name: str = ""
    value: float = 0


class UsageSummary(BaseModel):
    total_runs: int = 0
    total_cost: float = 0.0
    total_tokens: int = 0
    unique_agents_used: int = 0
    avg_runs_per_day: float = 0.0
    top_agent: TopItem = TopItem()
    top_model: TopItem = TopItem()


class AgentUsage(BaseModel):
    agent_name: str = ""
    agent_id: str = ""
    total_runs: int = 0
    total_cost: float = 0.0
    avg_latency_ms: float = 0.0
    success_rate: float = 0.0


class ModelUsage(BaseModel):
    model: str = ""
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_cost: float = 0.0
    run_count: int = 0


class DailyUsage(BaseModel):
    date: str = ""
    runs: int = 0
    cost: float = 0.0
    tokens: int = 0


# ============================================================================
# Helpers
# ============================================================================

def _period_to_start_date(period: str) -> date:
    """Convert a period string to a start date."""
    now = date.today()
    mapping = {
        "this_month": now.replace(day=1),
        "last_month": (now.replace(day=1) - timedelta(days=1)).replace(day=1),
        "last_90_days": now - timedelta(days=90),
    }
    return mapping.get(period, now.replace(day=1))


def _period_to_end_date(period: str) -> date:
    """Convert a period string to an end date."""
    now = date.today()
    if period == "last_month":
        return now.replace(day=1) - timedelta(days=1)
    return now


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/usage-summary", response_model=UsageSummary)
async def get_usage_summary(
    period: str = Query("this_month", regex="^(this_month|last_month|last_90_days)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Account-wide usage summary for the given period."""
    start = _period_to_start_date(period)
    end = _period_to_end_date(period)
    days_in_range = max((end - start).days, 1)

    try:
        # Main summary
        rows = await execute(
            """
            SELECT
                COUNT(*)::int AS total_runs,
                COALESCE(SUM(ar.cost), 0) AS total_cost,
                COALESCE(SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)), 0)::int AS total_tokens,
                COUNT(DISTINCT ar.agent_id)::int AS unique_agents
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        row = rows[0] if rows else {}
        total_runs = row.get("total_runs", 0) or 0
        total_cost = float(row.get("total_cost", 0) or 0)
        total_tokens = row.get("total_tokens", 0) or 0
        unique_agents = row.get("unique_agents", 0) or 0
        avg_runs_per_day = round(total_runs / days_in_range, 2)

        # Top agent
        top_agent_rows = await execute(
            """
            SELECT a.name AS agent_name, COUNT(*)::int AS runs
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            LEFT JOIN agents a ON ar.agent_id::text = a.agent_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
            GROUP BY a.name
            ORDER BY runs DESC
            LIMIT 1
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        top_agent = TopItem()
        if top_agent_rows:
            top_agent = TopItem(
                name=top_agent_rows[0].get("agent_name", "") or "Unknown",
                value=float(top_agent_rows[0].get("runs", 0) or 0),
            )

        # Top model
        top_model_rows = await execute(
            """
            SELECT ar.model, COALESCE(SUM(ar.cost), 0) AS cost
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
              AND ar.model IS NOT NULL
            GROUP BY ar.model
            ORDER BY cost DESC
            LIMIT 1
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        top_model = TopItem()
        if top_model_rows:
            top_model = TopItem(
                name=top_model_rows[0].get("model", "") or "Unknown",
                value=float(top_model_rows[0].get("cost", 0) or 0),
            )

        return UsageSummary(
            total_runs=total_runs,
            total_cost=total_cost,
            total_tokens=total_tokens,
            unique_agents_used=unique_agents,
            avg_runs_per_day=avg_runs_per_day,
            top_agent=top_agent,
            top_model=top_model,
        )

    except Exception as e:
        logger.warning(f"[reports] usage-summary query failed: {e}")
        return UsageSummary()


@router.get("/usage-by-agent", response_model=List[AgentUsage])
async def get_usage_by_agent(
    period: str = Query("this_month", regex="^(this_month|last_month|last_90_days)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Usage breakdown per agent."""
    start = _period_to_start_date(period)
    end = _period_to_end_date(period)

    try:
        rows = await execute(
            """
            SELECT
                COALESCE(a.name, 'Unknown') AS agent_name,
                ar.agent_id::text AS agent_id,
                COUNT(*)::int AS total_runs,
                COALESCE(SUM(ar.cost), 0) AS total_cost,
                COALESCE(AVG(
                    EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) * 1000
                ) FILTER (WHERE ar.completed_at IS NOT NULL), 0)::int AS avg_latency_ms,
                CASE WHEN COUNT(*) > 0
                    THEN ROUND(
                        COUNT(*) FILTER (WHERE ar.status = 'completed')::numeric / COUNT(*) * 100, 1
                    )
                    ELSE 0
                END AS success_rate
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            LEFT JOIN agents a ON ar.agent_id::text = a.agent_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
            GROUP BY a.name, ar.agent_id
            ORDER BY total_runs DESC
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        return [
            AgentUsage(
                agent_name=str(r.get("agent_name", "")),
                agent_id=str(r.get("agent_id", "")),
                total_runs=r.get("total_runs", 0) or 0,
                total_cost=float(r.get("total_cost", 0) or 0),
                avg_latency_ms=float(r.get("avg_latency_ms", 0) or 0),
                success_rate=float(r.get("success_rate", 0) or 0),
            )
            for r in (rows or [])
        ]
    except Exception as e:
        logger.warning(f"[reports] usage-by-agent query failed: {e}")
        return []


@router.get("/usage-by-model", response_model=List[ModelUsage])
async def get_usage_by_model(
    period: str = Query("this_month", regex="^(this_month|last_month|last_90_days)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Usage breakdown per model."""
    start = _period_to_start_date(period)
    end = _period_to_end_date(period)

    try:
        rows = await execute(
            """
            SELECT
                COALESCE(ar.model, 'unknown') AS model,
                COALESCE(SUM(ar.input_tokens), 0)::int AS total_tokens_in,
                COALESCE(SUM(ar.output_tokens), 0)::int AS total_tokens_out,
                COALESCE(SUM(ar.cost), 0) AS total_cost,
                COUNT(*)::int AS run_count
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
            GROUP BY ar.model
            ORDER BY total_cost DESC
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        return [
            ModelUsage(
                model=r.get("model", "unknown"),
                total_tokens_in=r.get("total_tokens_in", 0) or 0,
                total_tokens_out=r.get("total_tokens_out", 0) or 0,
                total_cost=float(r.get("total_cost", 0) or 0),
                run_count=r.get("run_count", 0) or 0,
            )
            for r in (rows or [])
        ]
    except Exception as e:
        logger.warning(f"[reports] usage-by-model query failed: {e}")
        return []


@router.get("/usage-by-day", response_model=List[DailyUsage])
async def get_usage_by_day(
    period: str = Query("this_month", regex="^(this_month|last_month|last_90_days)$"),
    granularity: str = Query("day", regex="^(day|week)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Usage breakdown by day or week."""
    start = _period_to_start_date(period)
    end = _period_to_end_date(period)

    date_trunc = "day" if granularity == "day" else "week"

    try:
        rows = await execute(
            f"""
            SELECT
                DATE_TRUNC('{date_trunc}', ar.started_at AT TIME ZONE 'UTC')::date AS bucket,
                COUNT(*)::int AS runs,
                COALESCE(SUM(ar.cost), 0) AS cost,
                COALESCE(SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)), 0)::int AS tokens
            FROM agent_runs ar
            JOIN threads t ON ar.thread_id::text = t.thread_id::text
            WHERE t.account_id::text = :user_id
              AND ar.started_at >= :start_date
              AND ar.started_at <= :end_date
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            {
                "user_id": user_id,
                "start_date": datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
                "end_date": datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc),
            },
        )
        return [
            DailyUsage(
                date=str(r.get("bucket", "")),
                runs=r.get("runs", 0) or 0,
                cost=float(r.get("cost", 0) or 0),
                tokens=r.get("tokens", 0) or 0,
            )
            for r in (rows or [])
        ]
    except Exception as e:
        logger.warning(f"[reports] usage-by-day query failed: {e}")
        return []


@router.get("/export/csv")
async def export_csv(
    period: str = Query("this_month", regex="^(this_month|last_month|last_90_days)$"),
    report_type: str = Query("summary", regex="^(summary|agents|models|daily)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export report data as CSV."""

    if report_type == "summary":
        data = await get_usage_summary(period=period, user_id=user_id)
        rows_out = [
            {
                "Metric": "Total Runs",
                "Value": data.total_runs,
            },
            {
                "Metric": "Total Cost ($)",
                "Value": round(data.total_cost, 4),
            },
            {
                "Metric": "Total Tokens",
                "Value": data.total_tokens,
            },
            {
                "Metric": "Unique Agents Used",
                "Value": data.unique_agents_used,
            },
            {
                "Metric": "Avg Runs/Day",
                "Value": data.avg_runs_per_day,
            },
            {
                "Metric": "Top Agent",
                "Value": f"{data.top_agent.name} ({int(data.top_agent.value)} runs)",
            },
            {
                "Metric": "Top Model",
                "Value": f"{data.top_model.name} (${round(data.top_model.value, 4)} cost)",
            },
        ]
        fieldnames = ["Metric", "Value"]

    elif report_type == "agents":
        items = await get_usage_by_agent(period=period, user_id=user_id)
        rows_out = [
            {
                "Agent Name": a.agent_name,
                "Agent ID": a.agent_id,
                "Total Runs": a.total_runs,
                "Total Cost ($)": round(a.total_cost, 4),
                "Avg Latency (ms)": round(a.avg_latency_ms, 1),
                "Success Rate (%)": a.success_rate,
            }
            for a in items
        ]
        fieldnames = ["Agent Name", "Agent ID", "Total Runs", "Total Cost ($)", "Avg Latency (ms)", "Success Rate (%)"]

    elif report_type == "models":
        items = await get_usage_by_model(period=period, user_id=user_id)
        rows_out = [
            {
                "Model": m.model,
                "Tokens In": m.total_tokens_in,
                "Tokens Out": m.total_tokens_out,
                "Total Cost ($)": round(m.total_cost, 4),
                "Run Count": m.run_count,
            }
            for m in items
        ]
        fieldnames = ["Model", "Tokens In", "Tokens Out", "Total Cost ($)", "Run Count"]

    else:  # daily
        items = await get_usage_by_day(period=period, granularity="day", user_id=user_id)
        rows_out = [
            {
                "Date": d.date,
                "Runs": d.runs,
                "Cost ($)": round(d.cost, 4),
                "Tokens": d.tokens,
            }
            for d in items
        ]
        fieldnames = ["Date", "Runs", "Cost ($)", "Tokens"]

    # Build CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_out)
    csv_content = output.getvalue()

    filename = f"recoder-report-{report_type}-{period}-{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
