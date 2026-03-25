"""
Per-agent analytics API endpoints.

Provides aggregated metrics, daily breakdowns, CSV export, and event recording
for agent run analytics. Computes metrics on-the-fly from agent_runs when
pre-computed data is unavailable, then caches into agent_analytics_daily.
"""

import csv
import io
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.utils.auth_utils import require_agent_access, AuthorizedAgentAccess
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-analytics"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AnalyticsOverview(BaseModel):
    totalRuns: int = 0
    successRate: float = 0.0
    errorRate: float = 0.0
    totalTokensIn: int = 0
    totalTokensOut: int = 0
    totalCost: float = 0.0
    avgResponseMs: int = 0
    avgTurns: float = 0.0
    modelBreakdown: Dict[str, Any] = {}
    toolBreakdown: Dict[str, Any] = {}


class DailyRecord(BaseModel):
    date: str
    totalRuns: int = 0
    successCount: int = 0
    errorCount: int = 0
    timeoutCount: int = 0
    totalTokensIn: int = 0
    totalTokensOut: int = 0
    totalCost: float = 0.0
    avgResponseMs: int = 0
    avgTurns: float = 0.0
    modelBreakdown: Dict[str, Any] = {}
    toolBreakdown: Dict[str, Any] = {}


class RecordEventRequest(BaseModel):
    run_id: str
    status: str = Field(..., description="completed, error, timeout")
    tokens_in: int = 0
    tokens_out: int = 0
    cost: float = 0.0
    response_ms: int = 0
    turns: float = 0.0
    model: Optional[str] = None
    tools_used: List[str] = []


class RecordEventResponse(BaseModel):
    success: bool
    date: str


# ============================================================================
# Helpers
# ============================================================================

def _range_to_dates(range_str: str) -> Optional[date]:
    """Convert a range string to a start date. Returns None for 'all'."""
    now = date.today()
    mapping = {
        "24h": now - timedelta(days=1),
        "7d": now - timedelta(days=7),
        "30d": now - timedelta(days=30),
        "90d": now - timedelta(days=90),
    }
    return mapping.get(range_str)


def _merge_json_breakdown(existing: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """Merge two breakdown dicts by summing counts."""
    merged = dict(existing)
    for key, val in new.items():
        if isinstance(val, (int, float)):
            merged[key] = merged.get(key, 0) + val
        else:
            merged[key] = val
    return merged


async def _compute_live_from_agent_runs(
    agent_id: str,
    account_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Query agent_runs table directly to compute daily aggregates.
    Falls back to this when agent_analytics_daily has no data.
    """
    where_clauses = ["ar.agent_id::text = :agent_id", "t.account_id::text = :account_id"]
    params: Dict[str, Any] = {"agent_id": agent_id, "account_id": account_id}

    if start_date:
        where_clauses.append("ar.started_at >= :start_date")
        params["start_date"] = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    if end_date:
        where_clauses.append("ar.started_at <= :end_date")
        params["end_date"] = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    where_sql = " AND ".join(where_clauses)

    sql = f"""
    SELECT
        DATE(ar.started_at AT TIME ZONE 'UTC') AS run_date,
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE ar.status = 'completed') AS success_count,
        COUNT(*) FILTER (WHERE ar.status = 'error') AS error_count,
        COUNT(*) FILTER (WHERE ar.status = 'timeout') AS timeout_count,
        COALESCE(AVG(
            EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) * 1000
        ) FILTER (WHERE ar.completed_at IS NOT NULL), 0)::INTEGER AS avg_response_ms
    FROM agent_runs ar
    JOIN threads t ON ar.thread_id::text = t.thread_id::text
    WHERE {where_sql}
    GROUP BY DATE(ar.started_at AT TIME ZONE 'UTC')
    ORDER BY run_date DESC
    """

    rows = await execute(sql, params)
    if not rows:
        return []

    results = []
    for row in rows:
        results.append({
            "date": str(row["run_date"]),
            "total_runs": row["total_runs"],
            "success_count": row["success_count"],
            "error_count": row["error_count"],
            "timeout_count": row["timeout_count"],
            "total_tokens_in": 0,
            "total_tokens_out": 0,
            "total_cost": 0,
            "avg_response_ms": row["avg_response_ms"],
            "avg_turns": 0,
            "model_breakdown": {},
            "tool_breakdown": {},
        })

    return results


async def _get_or_compute_daily_records(
    agent_id: str,
    account_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch from agent_analytics_daily. If empty, compute from agent_runs
    and cache the results.
    """
    where_clauses = ["agent_id::text = :agent_id"]
    params: Dict[str, Any] = {"agent_id": agent_id}

    if start_date:
        where_clauses.append("date >= :start_date")
        params["start_date"] = start_date
    if end_date:
        where_clauses.append("date <= :end_date")
        params["end_date"] = end_date

    where_sql = " AND ".join(where_clauses)

    sql = f"""
    SELECT
        date, total_runs, success_count, error_count, timeout_count,
        total_tokens_in, total_tokens_out, total_cost,
        avg_response_ms, avg_turns, model_breakdown, tool_breakdown,
        model_latency_breakdown
    FROM agent_analytics_daily
    WHERE {where_sql}
    ORDER BY date DESC
    """

    rows = await execute(sql, params)

    if rows and len(rows) > 0:
        return [
            {
                "date": str(row["date"]),
                "total_runs": row["total_runs"],
                "success_count": row["success_count"],
                "error_count": row["error_count"],
                "timeout_count": row["timeout_count"],
                "total_tokens_in": row["total_tokens_in"],
                "total_tokens_out": row["total_tokens_out"],
                "total_cost": float(row["total_cost"]),
                "avg_response_ms": row["avg_response_ms"],
                "avg_turns": float(row["avg_turns"]),
                "model_breakdown": row["model_breakdown"] or {},
                "tool_breakdown": row["tool_breakdown"] or {},
                "model_latency_breakdown": row.get("model_latency_breakdown") or {},
            }
            for row in rows
        ]

    # No pre-computed data -- compute from agent_runs live
    live_records = await _compute_live_from_agent_runs(agent_id, account_id, start_date, end_date)

    # Cache computed records into agent_analytics_daily
    for record in live_records:
        try:
            cache_sql = """
            INSERT INTO agent_analytics_daily (
                agent_id, account_id, date, total_runs, success_count,
                error_count, timeout_count, total_tokens_in, total_tokens_out,
                total_cost, avg_response_ms, avg_turns, model_breakdown, tool_breakdown
            ) VALUES (
                :agent_id, :account_id, :date, :total_runs, :success_count,
                :error_count, :timeout_count, :total_tokens_in, :total_tokens_out,
                :total_cost, :avg_response_ms, :avg_turns, :model_breakdown, :tool_breakdown
            )
            ON CONFLICT (agent_id, date) DO UPDATE SET
                total_runs = EXCLUDED.total_runs,
                success_count = EXCLUDED.success_count,
                error_count = EXCLUDED.error_count,
                timeout_count = EXCLUDED.timeout_count,
                total_tokens_in = EXCLUDED.total_tokens_in,
                total_tokens_out = EXCLUDED.total_tokens_out,
                total_cost = EXCLUDED.total_cost,
                avg_response_ms = EXCLUDED.avg_response_ms,
                avg_turns = EXCLUDED.avg_turns,
                model_breakdown = EXCLUDED.model_breakdown,
                tool_breakdown = EXCLUDED.tool_breakdown
            """
            await execute_mutate(cache_sql, {
                "agent_id": agent_id,
                "account_id": account_id,
                "date": record["date"],
                "total_runs": record["total_runs"],
                "success_count": record["success_count"],
                "error_count": record["error_count"],
                "timeout_count": record["timeout_count"],
                "total_tokens_in": record["total_tokens_in"],
                "total_tokens_out": record["total_tokens_out"],
                "total_cost": record["total_cost"],
                "avg_response_ms": record["avg_response_ms"],
                "avg_turns": record["avg_turns"],
                "model_breakdown": record["model_breakdown"],
                "tool_breakdown": record["tool_breakdown"],
            })
        except Exception as e:
            logger.warning(f"Failed to cache analytics for agent {agent_id} date {record['date']}: {e}")

    return live_records


def _aggregate_records(records: List[Dict[str, Any]]) -> AnalyticsOverview:
    """Aggregate a list of daily records into a single overview."""
    if not records:
        return AnalyticsOverview()

    total_runs = sum(r["total_runs"] for r in records)
    success_count = sum(r["success_count"] for r in records)
    error_count = sum(r["error_count"] for r in records)
    total_tokens_in = sum(r["total_tokens_in"] for r in records)
    total_tokens_out = sum(r["total_tokens_out"] for r in records)
    total_cost = sum(r["total_cost"] for r in records)

    # Weighted average for response_ms and turns
    weighted_ms = sum(r["avg_response_ms"] * r["total_runs"] for r in records)
    weighted_turns = sum(r["avg_turns"] * r["total_runs"] for r in records)

    avg_response_ms = int(weighted_ms / total_runs) if total_runs > 0 else 0
    avg_turns = round(weighted_turns / total_runs, 2) if total_runs > 0 else 0.0

    # Merge breakdowns
    model_breakdown: Dict[str, Any] = {}
    tool_breakdown: Dict[str, Any] = {}
    for r in records:
        model_breakdown = _merge_json_breakdown(model_breakdown, r.get("model_breakdown", {}))
        tool_breakdown = _merge_json_breakdown(tool_breakdown, r.get("tool_breakdown", {}))

    return AnalyticsOverview(
        totalRuns=total_runs,
        successRate=round((success_count / total_runs) * 100, 2) if total_runs > 0 else 0.0,
        errorRate=round((error_count / total_runs) * 100, 2) if total_runs > 0 else 0.0,
        totalTokensIn=total_tokens_in,
        totalTokensOut=total_tokens_out,
        totalCost=round(total_cost, 4),
        avgResponseMs=avg_response_ms,
        avgTurns=avg_turns,
        modelBreakdown=model_breakdown,
        toolBreakdown=tool_breakdown,
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{agent_id}/analytics", response_model=AnalyticsOverview, summary="Get agent analytics overview")
async def get_agent_analytics(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    range: str = Query("30d", description="Time range: 24h, 7d, 30d, 90d, all"),
):
    """
    Aggregated analytics for an agent over a time range.
    Computes on-the-fly from agent_runs if no pre-computed data exists.
    """
    try:
        start_date = _range_to_dates(range)
        end_date = date.today()

        records = await _get_or_compute_daily_records(
            agent_id=agent_id,
            account_id=auth.agent_data["account_id"],
            start_date=start_date,
            end_date=end_date,
        )

        return _aggregate_records(records)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agent analytics")


@router.get("/{agent_id}/analytics/daily", response_model=List[DailyRecord], summary="Get daily analytics breakdown")
async def get_agent_analytics_daily(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
):
    """
    Daily breakdown of analytics for chart rendering.
    """
    try:
        if from_date is None:
            from_date = date.today() - timedelta(days=30)
        if to_date is None:
            to_date = date.today()

        if from_date > to_date:
            raise HTTPException(status_code=400, detail="from_date must be before to_date")

        records = await _get_or_compute_daily_records(
            agent_id=agent_id,
            account_id=auth.agent_data["account_id"],
            start_date=from_date,
            end_date=to_date,
        )

        return [
            DailyRecord(
                date=r["date"],
                totalRuns=r["total_runs"],
                successCount=r["success_count"],
                errorCount=r["error_count"],
                timeoutCount=r["timeout_count"],
                totalTokensIn=r["total_tokens_in"],
                totalTokensOut=r["total_tokens_out"],
                totalCost=r["total_cost"],
                avgResponseMs=r["avg_response_ms"],
                avgTurns=r["avg_turns"],
                modelBreakdown=r.get("model_breakdown", {}),
                toolBreakdown=r.get("tool_breakdown", {}),
            )
            for r in records
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching daily analytics for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch daily analytics")


@router.get("/{agent_id}/analytics/export", summary="Export analytics as CSV")
async def export_agent_analytics(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    format: str = Query("csv", description="Export format (csv)"),
):
    """
    Export analytics as CSV.
    """
    if format != "csv":
        raise HTTPException(status_code=400, detail="Only CSV format is currently supported")

    try:
        records = await _get_or_compute_daily_records(
            agent_id=agent_id,
            account_id=auth.agent_data["account_id"],
        )

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "date", "total_runs", "success_count", "error_count", "timeout_count",
            "total_tokens_in", "total_tokens_out", "total_cost",
            "avg_response_ms", "avg_turns",
        ])

        # Sort by date ascending for export
        sorted_records = sorted(records, key=lambda r: r["date"])

        for r in sorted_records:
            writer.writerow([
                r["date"],
                r["total_runs"],
                r["success_count"],
                r["error_count"],
                r["timeout_count"],
                r["total_tokens_in"],
                r["total_tokens_out"],
                r["total_cost"],
                r["avg_response_ms"],
                r["avg_turns"],
            ])

        csv_content = output.getvalue()
        output.close()

        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=agent_{agent_id}_analytics.csv"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting analytics for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export analytics")


@router.post("/{agent_id}/analytics/record", response_model=RecordEventResponse, summary="Record analytics event")
async def record_analytics_event(
    agent_id: str,
    body: RecordEventRequest,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Record a single analytics event after an agent run completes.
    Upserts into agent_analytics_daily for the current date.
    """
    try:
        today = date.today()
        account_id = auth.agent_data["account_id"]

        # Build model and tool breakdown increments
        model_increment = {}
        if body.model:
            model_increment[body.model] = 1

        tool_increment = {}
        for tool in body.tools_used:
            tool_increment[tool] = tool_increment.get(tool, 0) + 1

        is_success = 1 if body.status == "completed" else 0
        is_error = 1 if body.status == "error" else 0
        is_timeout = 1 if body.status == "timeout" else 0

        # Upsert: insert new row or update existing aggregation for today
        sql = """
        INSERT INTO agent_analytics_daily (
            agent_id, account_id, date,
            total_runs, success_count, error_count, timeout_count,
            total_tokens_in, total_tokens_out, total_cost,
            avg_response_ms, avg_turns,
            model_breakdown, tool_breakdown
        ) VALUES (
            :agent_id, :account_id, :date,
            1, :success, :error, :timeout,
            :tokens_in, :tokens_out, :cost,
            :response_ms, :turns,
            :model_breakdown, :tool_breakdown
        )
        ON CONFLICT (agent_id, date) DO UPDATE SET
            total_runs = agent_analytics_daily.total_runs + 1,
            success_count = agent_analytics_daily.success_count + :success,
            error_count = agent_analytics_daily.error_count + :error,
            timeout_count = agent_analytics_daily.timeout_count + :timeout,
            total_tokens_in = agent_analytics_daily.total_tokens_in + :tokens_in,
            total_tokens_out = agent_analytics_daily.total_tokens_out + :tokens_out,
            total_cost = agent_analytics_daily.total_cost + :cost,
            avg_response_ms = CASE
                WHEN agent_analytics_daily.total_runs > 0
                THEN ((agent_analytics_daily.avg_response_ms * agent_analytics_daily.total_runs) + :response_ms)
                     / (agent_analytics_daily.total_runs + 1)
                ELSE :response_ms
            END,
            avg_turns = CASE
                WHEN agent_analytics_daily.total_runs > 0
                THEN ((agent_analytics_daily.avg_turns * agent_analytics_daily.total_runs) + :turns)
                     / (agent_analytics_daily.total_runs + 1)
                ELSE :turns
            END,
            model_breakdown = agent_analytics_daily.model_breakdown || :model_breakdown,
            tool_breakdown = agent_analytics_daily.tool_breakdown || :tool_breakdown
        """

        await execute_mutate(sql, {
            "agent_id": agent_id,
            "account_id": account_id,
            "date": today,
            "success": is_success,
            "error": is_error,
            "timeout": is_timeout,
            "tokens_in": body.tokens_in,
            "tokens_out": body.tokens_out,
            "cost": body.cost,
            "response_ms": body.response_ms,
            "turns": body.turns,
            "model_breakdown": model_increment,
            "tool_breakdown": tool_increment,
        })

        return RecordEventResponse(success=True, date=str(today))

    except Exception as e:
        logger.error(f"Error recording analytics event for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record analytics event")


# ============================================================================
# Model Performance Analytics
# ============================================================================

class ModelMetrics(BaseModel):
    model: str
    total_runs: int = 0
    success_rate: float = 0.0
    avg_latency_ms: int = 0
    p95_latency_ms: int = 0
    error_rate: float = 0.0
    cost_per_run: float = 0.0
    total_cost: float = 0.0
    recommendation: str = ""


class ModelAnalyticsResponse(BaseModel):
    models: List[ModelMetrics] = []
    range: str = "30d"
    fastest_model: str = ""
    cheapest_model: str = ""
    most_reliable_model: str = ""


@router.get("/{agent_id}/analytics/models", response_model=ModelAnalyticsResponse, summary="Get model performance analytics")
async def get_model_analytics(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    range: str = Query("30d", description="Time range: 24h, 7d, 30d, 90d, all"),
):
    """
    Model performance comparison for an agent.
    Groups metrics by model, computes latency percentiles, error rates, and cost per run.
    Returns recommendation badges (Fastest, Best Value, Most Reliable).
    """
    try:
        start_date = _range_to_dates(range)
        end_date = date.today()

        records = await _get_or_compute_daily_records(
            agent_id=agent_id,
            account_id=auth.agent_data["account_id"],
            start_date=start_date,
            end_date=end_date,
        )

        # Aggregate by model from model_breakdown and model_latency_breakdown
        model_stats: Dict[str, Dict[str, Any]] = {}
        for record in records:
            breakdown = record.get("model_breakdown", {})
            latency_breakdown = record.get("model_latency_breakdown", {})
            for model_name, run_count in breakdown.items():
                if not isinstance(run_count, (int, float)):
                    continue
                if model_name not in model_stats:
                    model_stats[model_name] = {
                        "total_runs": 0,
                        "success_count": 0,
                        "error_count": 0,
                        "total_cost": 0.0,
                        "total_latency_ms": 0,
                        "latencies": [],
                    }
                stats = model_stats[model_name]
                stats["total_runs"] += int(run_count)
                # Estimate per-model cost proportionally
                total_runs_in_record = record.get("total_runs", 1) or 1
                model_fraction = int(run_count) / total_runs_in_record
                stats["total_cost"] += record.get("total_cost", 0) * model_fraction
                # Estimate success/error proportionally
                stats["success_count"] += int(record.get("success_count", 0) * model_fraction)
                stats["error_count"] += int(record.get("error_count", 0) * model_fraction)
                # Latency from breakdown if available
                model_latency = latency_breakdown.get(model_name, {})
                if isinstance(model_latency, dict):
                    stats["total_latency_ms"] += model_latency.get("total_ms", record.get("avg_response_ms", 0) * int(run_count))
                    if "p95_ms" in model_latency:
                        stats["latencies"].append(model_latency["p95_ms"])
                else:
                    stats["total_latency_ms"] += record.get("avg_response_ms", 0) * int(run_count)

        # Build ModelMetrics list
        model_metrics = []
        for model_name, stats in model_stats.items():
            total = stats["total_runs"]
            if total == 0:
                continue
            avg_latency = int(stats["total_latency_ms"] / total) if total > 0 else 0
            p95 = max(stats["latencies"]) if stats["latencies"] else avg_latency
            success_rate = round((stats["success_count"] / total) * 100, 2) if total > 0 else 0.0
            error_rate = round((stats["error_count"] / total) * 100, 2) if total > 0 else 0.0
            cost_per_run = round(stats["total_cost"] / total, 6) if total > 0 else 0.0

            model_metrics.append(ModelMetrics(
                model=model_name,
                total_runs=total,
                success_rate=success_rate,
                avg_latency_ms=avg_latency,
                p95_latency_ms=p95,
                error_rate=error_rate,
                cost_per_run=cost_per_run,
                total_cost=round(stats["total_cost"], 4),
            ))

        # Sort by total_runs DESC
        model_metrics.sort(key=lambda m: m.total_runs, reverse=True)

        # Assign recommendation badges
        fastest = ""
        cheapest = ""
        most_reliable = ""
        if model_metrics:
            by_latency = sorted(model_metrics, key=lambda m: m.avg_latency_ms)
            fastest = by_latency[0].model
            by_cost = sorted(model_metrics, key=lambda m: m.cost_per_run)
            cheapest = by_cost[0].model
            by_reliability = sorted(model_metrics, key=lambda m: m.success_rate, reverse=True)
            most_reliable = by_reliability[0].model

            for m in model_metrics:
                badges = []
                if m.model == fastest:
                    badges.append("Fastest")
                if m.model == cheapest:
                    badges.append("Best Value")
                if m.model == most_reliable:
                    badges.append("Most Reliable")
                m.recommendation = ", ".join(badges)

        return ModelAnalyticsResponse(
            models=model_metrics,
            range=range,
            fastest_model=fastest,
            cheapest_model=cheapest,
            most_reliable_model=most_reliable,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching model analytics for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch model analytics")
