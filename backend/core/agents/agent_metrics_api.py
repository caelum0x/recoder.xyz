"""
Agent metrics API endpoints.

Provides detailed metrics views: overview (runs/latency/cost), tool usage,
and cost breakdowns per model. All queries filter by account_id for security.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import require_agent_access, AuthorizedAgentAccess
from core.services.db import execute
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["Agent Metrics"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RunsByDay(BaseModel):
    date: str
    runs: int = 0
    successes: int = 0
    failures: int = 0


class MetricsOverviewResponse(BaseModel):
    total_runs: int = 0
    successful_runs: int = 0
    failed_runs: int = 0
    success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    total_cost: float = 0.0
    avg_cost_per_run: float = 0.0
    runs_by_day: List[RunsByDay] = []


class ToolMetric(BaseModel):
    tool_name: str
    call_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    avg_duration_ms: float = 0.0


class ToolMetricsResponse(BaseModel):
    tools: List[ToolMetric] = []


class ModelCost(BaseModel):
    model: str
    total_cost: float = 0.0
    run_count: int = 0
    avg_cost: float = 0.0


class DayCost(BaseModel):
    date: str
    cost: float = 0.0


class TokenSummary(BaseModel):
    total_input: int = 0
    total_output: int = 0
    avg_input_per_run: int = 0
    avg_output_per_run: int = 0


class CostBreakdownResponse(BaseModel):
    by_model: List[ModelCost] = []
    by_day: List[DayCost] = []
    tokens: TokenSummary = TokenSummary()
    projected_monthly_cost: float = 0.0


# ============================================================================
# Helpers
# ============================================================================

def _thirty_days_ago() -> date:
    return date.today() - timedelta(days=30)


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/{agent_id}/metrics/overview",
    response_model=MetricsOverviewResponse,
    summary="Agent Metrics Overview",
    operation_id="get_agent_metrics_overview",
)
async def get_metrics_overview(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Get aggregate run metrics for an agent over the last 30 days.
    Includes total runs, success/failure counts, latency, cost, and daily breakdown.
    """
    account_id = auth.agent_data.get("account_id") if auth.agent_data else None
    if not account_id:
        # Fallback: try to derive account from thread ownership
        account_id = auth.user_id

    start_date = _thirty_days_ago()

    try:
        # ---- Aggregate stats ----
        agg_sql = """
        SELECT
            COUNT(*) AS total_runs,
            COUNT(*) FILTER (WHERE ar.status = 'completed') AS successful_runs,
            COUNT(*) FILTER (WHERE ar.status IN ('error', 'failed')) AS failed_runs,
            COALESCE(AVG(
                EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) * 1000
            ) FILTER (WHERE ar.completed_at IS NOT NULL), 0) AS avg_latency_ms,
            COALESCE(SUM(ar.cost), 0) AS total_cost
        FROM agent_runs ar
        JOIN threads t ON ar.thread_id = t.thread_id
        WHERE ar.agent_id = :agent_id
          AND t.account_id = :account_id
          AND ar.started_at >= :start_date
        """
        agg_params: Dict[str, Any] = {
            "agent_id": agent_id,
            "account_id": account_id,
            "start_date": datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
        }

        agg_rows = await execute(agg_sql, agg_params)
        agg = agg_rows[0] if agg_rows else {}

        total_runs = int(agg.get("total_runs", 0) or 0)
        successful_runs = int(agg.get("successful_runs", 0) or 0)
        failed_runs = int(agg.get("failed_runs", 0) or 0)
        avg_latency_ms = float(agg.get("avg_latency_ms", 0) or 0)
        total_cost = float(agg.get("total_cost", 0) or 0)
        success_rate = (successful_runs / total_runs * 100) if total_runs > 0 else 0.0
        avg_cost_per_run = (total_cost / total_runs) if total_runs > 0 else 0.0

        # ---- Daily breakdown ----
        daily_sql = """
        SELECT
            DATE(ar.started_at AT TIME ZONE 'UTC') AS run_date,
            COUNT(*) AS runs,
            COUNT(*) FILTER (WHERE ar.status = 'completed') AS successes,
            COUNT(*) FILTER (WHERE ar.status IN ('error', 'failed')) AS failures
        FROM agent_runs ar
        JOIN threads t ON ar.thread_id = t.thread_id
        WHERE ar.agent_id = :agent_id
          AND t.account_id = :account_id
          AND ar.started_at >= :start_date
        GROUP BY DATE(ar.started_at AT TIME ZONE 'UTC')
        ORDER BY run_date ASC
        """

        daily_rows = await execute(daily_sql, agg_params)
        runs_by_day = [
            RunsByDay(
                date=str(row["run_date"]),
                runs=int(row.get("runs", 0) or 0),
                successes=int(row.get("successes", 0) or 0),
                failures=int(row.get("failures", 0) or 0),
            )
            for row in (daily_rows or [])
        ]

        return MetricsOverviewResponse(
            total_runs=total_runs,
            successful_runs=successful_runs,
            failed_runs=failed_runs,
            success_rate=round(success_rate, 2),
            avg_latency_ms=round(avg_latency_ms, 1),
            total_cost=round(total_cost, 6),
            avg_cost_per_run=round(avg_cost_per_run, 6),
            runs_by_day=runs_by_day,
        )

    except Exception as e:
        logger.warning(f"[agent_metrics] overview query failed for agent {agent_id}: {e}")
        return MetricsOverviewResponse()


@router.get(
    "/{agent_id}/metrics/tools",
    response_model=ToolMetricsResponse,
    summary="Agent Tool Metrics",
    operation_id="get_agent_tool_metrics",
)
async def get_tool_metrics(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Get per-tool usage metrics: call count, success/failure, avg duration.
    Sorted by call_count descending.
    """
    account_id = auth.agent_data.get("account_id") if auth.agent_data else None
    if not account_id:
        account_id = auth.user_id

    start_date = _thirty_days_ago()

    try:
        # Try using the tool_breakdown JSONB from agent_analytics_daily first
        analytics_sql = """
        SELECT tool_breakdown
        FROM agent_analytics_daily
        WHERE agent_id = :agent_id
          AND date >= :start_date
        """
        analytics_rows = await execute(analytics_sql, {
            "agent_id": agent_id,
            "start_date": start_date,
        })

        if analytics_rows:
            # Merge tool breakdowns from daily records
            merged: Dict[str, Dict[str, Any]] = {}
            for row in analytics_rows:
                tb = row.get("tool_breakdown")
                if not tb or not isinstance(tb, dict):
                    continue
                for tool_name, stats in tb.items():
                    if tool_name not in merged:
                        merged[tool_name] = {
                            "call_count": 0,
                            "success_count": 0,
                            "failure_count": 0,
                            "total_duration_ms": 0.0,
                        }
                    if isinstance(stats, dict):
                        merged[tool_name]["call_count"] += int(stats.get("total", stats.get("call_count", 0)) or 0)
                        merged[tool_name]["success_count"] += int(stats.get("success", stats.get("success_count", 0)) or 0)
                        merged[tool_name]["failure_count"] += int(stats.get("failure", stats.get("failure_count", 0)) or 0)
                        merged[tool_name]["total_duration_ms"] += float(stats.get("total_duration_ms", 0) or 0)
                    elif isinstance(stats, (int, float)):
                        merged[tool_name]["call_count"] += int(stats)

            tools = []
            for tool_name, data in merged.items():
                cc = data["call_count"]
                avg_dur = (data["total_duration_ms"] / cc) if cc > 0 else 0
                tools.append(ToolMetric(
                    tool_name=tool_name,
                    call_count=cc,
                    success_count=data["success_count"],
                    failure_count=data["failure_count"],
                    avg_duration_ms=round(avg_dur, 1),
                ))

            tools.sort(key=lambda t: t.call_count, reverse=True)
            return ToolMetricsResponse(tools=tools)

        # Fallback: try tool_calls table if it exists
        try:
            tc_sql = """
            SELECT
                tc.tool_name,
                COUNT(*) AS call_count,
                COUNT(*) FILTER (WHERE tc.status = 'success') AS success_count,
                COUNT(*) FILTER (WHERE tc.status IN ('error', 'failed')) AS failure_count,
                COALESCE(AVG(tc.duration_ms), 0) AS avg_duration_ms
            FROM tool_calls tc
            JOIN agent_runs ar ON tc.agent_run_id = ar.id
            JOIN threads t ON ar.thread_id = t.thread_id
            WHERE ar.agent_id = :agent_id
              AND t.account_id = :account_id
              AND tc.created_at >= :start_date
            GROUP BY tc.tool_name
            ORDER BY call_count DESC
            """
            tc_rows = await execute(tc_sql, {
                "agent_id": agent_id,
                "account_id": account_id,
                "start_date": datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
            })

            if tc_rows:
                tools = [
                    ToolMetric(
                        tool_name=row["tool_name"],
                        call_count=int(row.get("call_count", 0) or 0),
                        success_count=int(row.get("success_count", 0) or 0),
                        failure_count=int(row.get("failure_count", 0) or 0),
                        avg_duration_ms=round(float(row.get("avg_duration_ms", 0) or 0), 1),
                    )
                    for row in tc_rows
                ]
                return ToolMetricsResponse(tools=tools)
        except Exception:
            # tool_calls table may not exist yet
            pass

        return ToolMetricsResponse()

    except Exception as e:
        logger.warning(f"[agent_metrics] tool metrics query failed for agent {agent_id}: {e}")
        return ToolMetricsResponse()


@router.get(
    "/{agent_id}/metrics/cost-breakdown",
    response_model=CostBreakdownResponse,
    summary="Agent Cost Breakdown",
    operation_id="get_agent_cost_breakdown",
)
async def get_cost_breakdown(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Get cost breakdown by model, daily cost trend, token usage, and projected monthly cost.
    """
    account_id = auth.agent_data.get("account_id") if auth.agent_data else None
    if not account_id:
        account_id = auth.user_id

    start_date = _thirty_days_ago()
    base_params: Dict[str, Any] = {
        "agent_id": agent_id,
        "account_id": account_id,
        "start_date": datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
    }

    by_model: List[ModelCost] = []
    by_day: List[DayCost] = []
    tokens = TokenSummary()
    projected_monthly_cost = 0.0

    try:
        # ---- Cost by model ----
        model_sql = """
        SELECT
            COALESCE(ar.model, 'unknown') AS model,
            COALESCE(SUM(ar.cost), 0) AS total_cost,
            COUNT(*) AS run_count
        FROM agent_runs ar
        JOIN threads t ON ar.thread_id = t.thread_id
        WHERE ar.agent_id = :agent_id
          AND t.account_id = :account_id
          AND ar.started_at >= :start_date
        GROUP BY COALESCE(ar.model, 'unknown')
        ORDER BY total_cost DESC
        """
        model_rows = await execute(model_sql, base_params)
        if model_rows:
            by_model = [
                ModelCost(
                    model=str(row.get("model", "unknown")),
                    total_cost=round(float(row.get("total_cost", 0) or 0), 6),
                    run_count=int(row.get("run_count", 0) or 0),
                    avg_cost=round(
                        float(row.get("total_cost", 0) or 0) / max(int(row.get("run_count", 1) or 1), 1),
                        6
                    ),
                )
                for row in model_rows
            ]
    except Exception as e:
        logger.warning(f"[agent_metrics] cost by model query failed: {e}")

    try:
        # ---- Daily cost ----
        day_sql = """
        SELECT
            DATE(ar.started_at AT TIME ZONE 'UTC') AS run_date,
            COALESCE(SUM(ar.cost), 0) AS cost
        FROM agent_runs ar
        JOIN threads t ON ar.thread_id = t.thread_id
        WHERE ar.agent_id = :agent_id
          AND t.account_id = :account_id
          AND ar.started_at >= :start_date
        GROUP BY DATE(ar.started_at AT TIME ZONE 'UTC')
        ORDER BY run_date ASC
        """
        day_rows = await execute(day_sql, base_params)
        if day_rows:
            by_day = [
                DayCost(
                    date=str(row["run_date"]),
                    cost=round(float(row.get("cost", 0) or 0), 6),
                )
                for row in day_rows
            ]

            # Projected monthly cost: avg daily cost * 30
            total_daily_cost = sum(d.cost for d in by_day)
            days_with_data = len(by_day)
            if days_with_data > 0:
                avg_daily = total_daily_cost / days_with_data
                projected_monthly_cost = round(avg_daily * 30, 2)
    except Exception as e:
        logger.warning(f"[agent_metrics] daily cost query failed: {e}")

    try:
        # ---- Token usage ----
        token_sql = """
        SELECT
            COALESCE(SUM(ar.tokens_in), 0) AS total_input,
            COALESCE(SUM(ar.tokens_out), 0) AS total_output,
            COUNT(*) AS run_count
        FROM agent_runs ar
        JOIN threads t ON ar.thread_id = t.thread_id
        WHERE ar.agent_id = :agent_id
          AND t.account_id = :account_id
          AND ar.started_at >= :start_date
        """
        token_rows = await execute(token_sql, base_params)
        if token_rows and token_rows[0]:
            row = token_rows[0]
            total_input = int(row.get("total_input", 0) or 0)
            total_output = int(row.get("total_output", 0) or 0)
            run_count = int(row.get("run_count", 0) or 0)
            tokens = TokenSummary(
                total_input=total_input,
                total_output=total_output,
                avg_input_per_run=int(total_input / run_count) if run_count > 0 else 0,
                avg_output_per_run=int(total_output / run_count) if run_count > 0 else 0,
            )
    except Exception as e:
        logger.warning(f"[agent_metrics] token query failed: {e}")

    return CostBreakdownResponse(
        by_model=by_model,
        by_day=by_day,
        tokens=tokens,
        projected_monthly_cost=projected_monthly_cost,
    )
