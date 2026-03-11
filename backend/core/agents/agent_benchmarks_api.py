"""
Agent Performance Benchmarks API endpoints.

Provides benchmark CRUD, simulated runs, results history, and summary statistics.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import random
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-benchmarks-v2"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateBenchmarkRequest(BaseModel):
    benchmark_name: str
    benchmark_type: Optional[str] = "latency"
    config: Optional[Dict[str, Any]] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/benchmarks/v2",
    summary="Create a benchmark definition",
    operation_id="create_agent_benchmark_v2",
)
async def create_benchmark(
    agent_id: str,
    body: CreateBenchmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new benchmark definition for an agent."""
    valid_types = ("latency", "throughput", "accuracy", "cost", "custom")
    btype = body.benchmark_type or "latency"
    if btype not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid benchmark_type. Must be one of: {', '.join(valid_types)}",
        )

    row = await execute_one(
        """
        INSERT INTO agent_benchmarks_v2 (user_id, agent_id, benchmark_name, benchmark_type, config)
        VALUES (:user_id, :agent_id, :benchmark_name, :benchmark_type, :config)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "benchmark_name": body.benchmark_name,
            "benchmark_type": btype,
            "config": body.config or {},
        },
        commit=True,
    )

    return row


@router.get(
    "/agents/{agent_id}/benchmarks/v2",
    summary="List benchmarks with latest result",
    operation_id="list_agent_benchmarks_v2",
)
async def list_benchmarks(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all benchmark definitions for an agent, including latest result."""
    rows = await execute(
        """
        SELECT
            b.*,
            lr.score AS latest_score,
            lr.status AS latest_status,
            lr.duration_ms AS latest_duration_ms,
            lr.run_at AS latest_run_at,
            lr.metrics AS latest_metrics,
            (SELECT COUNT(*) FROM benchmark_results br WHERE br.benchmark_id = b.id) AS run_count,
            (SELECT MAX(br2.score) FROM benchmark_results br2 WHERE br2.benchmark_id = b.id AND br2.status = 'completed') AS best_score
        FROM agent_benchmarks_v2 b
        LEFT JOIN LATERAL (
            SELECT score, status, duration_ms, run_at, metrics
            FROM benchmark_results
            WHERE benchmark_id = b.id
            ORDER BY run_at DESC
            LIMIT 1
        ) lr ON TRUE
        WHERE b.user_id = :user_id AND b.agent_id = :agent_id
        ORDER BY b.created_at DESC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    return {"benchmarks": serialize_rows(rows)}


@router.delete(
    "/agents/{agent_id}/benchmarks/v2/{benchmark_id}",
    summary="Delete a benchmark",
    operation_id="delete_agent_benchmark_v2",
)
async def delete_benchmark(
    agent_id: str,
    benchmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a benchmark definition and all its results (cascade)."""
    existing = await execute_one(
        """
        SELECT id FROM agent_benchmarks_v2
        WHERE id = :benchmark_id AND user_id = :user_id AND agent_id = :agent_id
        """,
        {"benchmark_id": benchmark_id, "user_id": user_id, "agent_id": agent_id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Benchmark not found")

    await execute_mutate(
        "DELETE FROM agent_benchmarks_v2 WHERE id = :benchmark_id",
        {"benchmark_id": benchmark_id},
    )

    return {"deleted": True}


@router.post(
    "/agents/{agent_id}/benchmarks/v2/{benchmark_id}/run",
    summary="Run a benchmark",
    operation_id="run_agent_benchmark_v2",
)
async def run_benchmark(
    agent_id: str,
    benchmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Run a benchmark by simulating execution based on type.
    - latency: random 50-500ms
    - throughput: random 10-100 ops/s
    - accuracy: random 70-99%
    - cost: random $0.01-$1.00
    - custom: random 0-100 score
    """
    benchmark = await execute_one(
        """
        SELECT * FROM agent_benchmarks_v2
        WHERE id = :benchmark_id AND user_id = :user_id AND agent_id = :agent_id
        """,
        {"benchmark_id": benchmark_id, "user_id": user_id, "agent_id": agent_id},
    )

    if not benchmark:
        raise HTTPException(status_code=404, detail="Benchmark not found")

    btype = benchmark.get("benchmark_type", "latency")

    # Simulate execution based on type
    if btype == "latency":
        score = round(random.uniform(50, 500), 4)
        duration_ms = int(score)
        metrics = {"unit": "ms", "p50": round(score * 0.8, 2), "p99": round(score * 1.5, 2)}
    elif btype == "throughput":
        score = round(random.uniform(10, 100), 4)
        duration_ms = random.randint(1000, 5000)
        metrics = {"unit": "ops/s", "peak": round(score * 1.3, 2)}
    elif btype == "accuracy":
        score = round(random.uniform(70, 99), 4)
        duration_ms = random.randint(500, 3000)
        metrics = {"unit": "%", "samples": random.randint(100, 1000)}
    elif btype == "cost":
        score = round(random.uniform(0.01, 1.00), 4)
        duration_ms = random.randint(200, 2000)
        metrics = {"unit": "$", "tokens_used": random.randint(500, 5000)}
    else:
        # custom
        score = round(random.uniform(0, 100), 4)
        duration_ms = random.randint(100, 3000)
        metrics = {"unit": "score"}

    result = await execute_one(
        """
        INSERT INTO benchmark_results (benchmark_id, user_id, agent_id, score, metrics, duration_ms, status)
        VALUES (:benchmark_id, :user_id, :agent_id, :score, :metrics, :duration_ms, 'completed')
        RETURNING *
        """,
        {
            "benchmark_id": benchmark_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "score": score,
            "metrics": metrics,
            "duration_ms": duration_ms,
        },
        commit=True,
    )

    return result


@router.get(
    "/agents/{agent_id}/benchmarks/v2/{benchmark_id}/results",
    summary="List benchmark results",
    operation_id="list_benchmark_results_v2",
)
async def list_benchmark_results(
    agent_id: str,
    benchmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
):
    """List results for a specific benchmark."""
    rows = await execute(
        """
        SELECT * FROM benchmark_results
        WHERE benchmark_id = :benchmark_id AND user_id = :user_id AND agent_id = :agent_id
        ORDER BY run_at DESC
        LIMIT :limit
        """,
        {
            "benchmark_id": benchmark_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "limit": limit,
        },
    )

    return {"results": serialize_rows(rows)}


@router.get(
    "/agents/{agent_id}/benchmark-summary/v2",
    summary="Benchmark summary for agent",
    operation_id="agent_benchmark_summary_v2",
)
async def benchmark_summary(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Summary of all benchmarks: best/worst/avg scores per benchmark,
    plus improvement trend (comparing first and last result).
    """
    benchmarks = await execute(
        """
        SELECT * FROM agent_benchmarks_v2
        WHERE user_id = :user_id AND agent_id = :agent_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    summaries = []
    for bench in benchmarks:
        bench_id = str(bench["id"])

        stats = await execute_one(
            """
            SELECT
                COUNT(*) AS run_count,
                MIN(score) AS worst_score,
                MAX(score) AS best_score,
                AVG(score) AS avg_score
            FROM benchmark_results
            WHERE benchmark_id = :benchmark_id AND status = 'completed'
            """,
            {"benchmark_id": bench_id},
        )

        # Improvement trend: compare earliest vs latest completed result
        first_result = await execute_one(
            """
            SELECT score FROM benchmark_results
            WHERE benchmark_id = :benchmark_id AND status = 'completed'
            ORDER BY run_at ASC
            LIMIT 1
            """,
            {"benchmark_id": bench_id},
        )
        last_result = await execute_one(
            """
            SELECT score FROM benchmark_results
            WHERE benchmark_id = :benchmark_id AND status = 'completed'
            ORDER BY run_at DESC
            LIMIT 1
            """,
            {"benchmark_id": bench_id},
        )

        improvement = None
        if first_result and last_result and first_result["score"]:
            first_score = float(first_result["score"])
            last_score = float(last_result["score"])
            if first_score != 0:
                improvement = round(((last_score - first_score) / abs(first_score)) * 100, 2)

        summaries.append({
            "benchmark_id": bench_id,
            "benchmark_name": bench.get("benchmark_name"),
            "benchmark_type": bench.get("benchmark_type"),
            "run_count": int(stats["run_count"]) if stats else 0,
            "best_score": float(stats["best_score"]) if stats and stats["best_score"] is not None else None,
            "worst_score": float(stats["worst_score"]) if stats and stats["worst_score"] is not None else None,
            "avg_score": round(float(stats["avg_score"]), 4) if stats and stats["avg_score"] is not None else None,
            "improvement_pct": improvement,
        })

    return {"agent_id": agent_id, "summaries": summaries}
