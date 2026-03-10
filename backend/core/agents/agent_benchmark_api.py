from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
import json

router = APIRouter(tags=["agent-benchmarks"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class GenerateBenchmarkRequest(BaseModel):
    period: str = "7d"  # 7d, 14d, 30d


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/agents/{agent_id}/benchmarks",
    summary="List benchmarks for an agent",
    operation_id="list_agent_benchmarks",
)
async def list_agent_benchmarks(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    model: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all performance benchmarks for a given agent."""
    where = "user_id = :user_id AND agent_id = :agent_id"
    params: dict = {
        "user_id": user_id,
        "agent_id": agent_id,
        "limit": limit,
        "offset": offset,
    }

    if model:
        where += " AND model = :model"
        params["model"] = model

    rows = await execute(
        f"""
        SELECT * FROM agent_benchmarks
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) FROM agent_benchmarks WHERE {where}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "benchmarks": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post(
    "/agents/{agent_id}/benchmarks/generate",
    summary="Generate benchmark from recent runs",
    operation_id="generate_agent_benchmark",
)
async def generate_agent_benchmark(
    agent_id: str,
    body: GenerateBenchmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Aggregate metrics from agent_runs table over a period and create
    a benchmark record. Supports 7d, 14d, 30d periods.
    """
    period_days = {"7d": 7, "14d": 14, "30d": 30}.get(body.period, 7)
    now = datetime.now(timezone.utc)
    period_start = now - timedelta(days=period_days)

    # Aggregate runs from the agent_runs table
    agg = await execute_one(
        """
        SELECT
            COUNT(*) AS total_runs,
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::INTEGER AS avg_latency_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000
            )::INTEGER AS p95_latency_ms,
            AVG(tokens_used)::INTEGER AS avg_tokens_in,
            AVG(completion_tokens)::INTEGER AS avg_tokens_out,
            AVG(cost)::NUMERIC(10,6) AS avg_cost,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0),
                2
            ) AS success_rate
        FROM agent_runs
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND started_at >= :period_start
          AND ended_at IS NOT NULL
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )

    total_runs = int(agg["total_runs"]) if agg and agg["total_runs"] else 0
    if total_runs == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No completed runs found for this agent in the last {body.period}",
        )

    # Detect dominant model
    model_row = await execute_one(
        """
        SELECT model, COUNT(*) AS cnt
        FROM agent_runs
        WHERE user_id = :user_id
          AND agent_id = :agent_id
          AND started_at >= :period_start
        GROUP BY model
        ORDER BY cnt DESC
        LIMIT 1
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "period_start": period_start.isoformat(),
        },
    )
    dominant_model = model_row["model"] if model_row else None

    benchmark_name = f"{body.period} benchmark — {now.strftime('%Y-%m-%d')}"

    row = await execute_one(
        """
        INSERT INTO agent_benchmarks (
            user_id, agent_id, benchmark_name, model,
            avg_latency_ms, p95_latency_ms,
            avg_tokens_in, avg_tokens_out,
            avg_cost, success_rate, total_runs,
            period_start, period_end, metadata
        ) VALUES (
            :user_id, :agent_id, :benchmark_name, :model,
            :avg_latency_ms, :p95_latency_ms,
            :avg_tokens_in, :avg_tokens_out,
            :avg_cost, :success_rate, :total_runs,
            :period_start, :period_end, :metadata
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "benchmark_name": benchmark_name,
            "model": dominant_model,
            "avg_latency_ms": agg["avg_latency_ms"],
            "p95_latency_ms": agg["p95_latency_ms"],
            "avg_tokens_in": agg["avg_tokens_in"],
            "avg_tokens_out": agg["avg_tokens_out"],
            "avg_cost": float(agg["avg_cost"]) if agg["avg_cost"] else 0,
            "success_rate": float(agg["success_rate"]) if agg["success_rate"] else 0,
            "total_runs": total_runs,
            "period_start": period_start.isoformat(),
            "period_end": now.isoformat(),
            "metadata": json.dumps({"period": body.period, "generated_at": now.isoformat()}),
        },
    )

    return dict(row)


@router.get(
    "/agents/{agent_id}/benchmarks/compare",
    summary="Compare benchmarks across models",
    operation_id="compare_agent_benchmarks",
)
async def compare_agent_benchmarks(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Return per-model average benchmark metrics for a given agent.
    Uses the stored benchmark records.
    """
    rows = await execute(
        """
        SELECT
            model,
            AVG(avg_latency_ms)::INTEGER AS avg_latency_ms,
            AVG(p95_latency_ms)::INTEGER AS p95_latency_ms,
            AVG(avg_tokens_in)::INTEGER AS avg_tokens_in,
            AVG(avg_tokens_out)::INTEGER AS avg_tokens_out,
            AVG(avg_cost)::NUMERIC(10,6) AS avg_cost,
            AVG(success_rate)::NUMERIC(5,2) AS success_rate,
            SUM(total_runs)::INTEGER AS total_runs,
            COUNT(*) AS benchmark_count
        FROM agent_benchmarks
        WHERE user_id = :user_id AND agent_id = :agent_id AND model IS NOT NULL
        GROUP BY model
        ORDER BY success_rate DESC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    return {
        "agent_id": agent_id,
        "models": [dict(r) for r in rows],
    }


@router.get(
    "/benchmarks/leaderboard",
    summary="Benchmark leaderboard across agents",
    operation_id="benchmark_leaderboard",
)
async def benchmark_leaderboard(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    metric: str = Query("success_rate", description="success_rate | cost_efficiency | speed"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Top agents by the chosen metric, using their latest benchmark data.
    """
    order_expr = {
        "success_rate": "b.success_rate DESC NULLS LAST",
        "cost_efficiency": "(b.success_rate / NULLIF(b.avg_cost, 0)) DESC NULLS LAST",
        "speed": "b.avg_latency_ms ASC NULLS LAST",
    }.get(metric, "b.success_rate DESC NULLS LAST")

    rows = await execute(
        f"""
        SELECT DISTINCT ON (b.agent_id)
            b.agent_id,
            b.benchmark_name,
            b.model,
            b.avg_latency_ms,
            b.p95_latency_ms,
            b.avg_cost,
            b.success_rate,
            b.total_runs,
            b.created_at,
            CASE WHEN b.avg_cost > 0
                 THEN ROUND((b.success_rate / b.avg_cost)::NUMERIC, 2)
                 ELSE NULL
            END AS cost_efficiency
        FROM agent_benchmarks b
        WHERE b.user_id = :user_id
        ORDER BY b.agent_id, b.created_at DESC
        """,
        {"user_id": user_id},
    )

    # Sort in Python since DISTINCT ON constrains the ORDER BY
    def sort_key(r):
        if metric == "success_rate":
            return -(float(r["success_rate"]) if r["success_rate"] else 0)
        elif metric == "cost_efficiency":
            return -(float(r["cost_efficiency"]) if r["cost_efficiency"] else 0)
        elif metric == "speed":
            return int(r["avg_latency_ms"]) if r["avg_latency_ms"] else 999999
        return 0

    sorted_rows = sorted([dict(r) for r in rows], key=sort_key)

    return {
        "metric": metric,
        "leaderboard": sorted_rows[:limit],
    }
