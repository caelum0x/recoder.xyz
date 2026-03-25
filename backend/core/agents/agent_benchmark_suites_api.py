"""
Agent Benchmark Suites API endpoints (Sprint 70 Phase 4).

Provides CRUD for benchmark suites, simulated runs, run history, and leaderboards.
Access control enforced at application layer (WHERE user_id::text = :user_id).
"""

import uuid
import random
import time
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-benchmarks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateBenchmarkSuiteRequest(BaseModel):
    suite_name: str
    description: Optional[str] = None
    test_cases: List[Dict[str, Any]] = Field(default_factory=list)
    scoring_method: str = "average"


class UpdateBenchmarkSuiteRequest(BaseModel):
    suite_name: Optional[str] = None
    description: Optional[str] = None
    test_cases: Optional[List[Dict[str, Any]]] = None
    scoring_method: Optional[str] = None


class RunBenchmarkRequest(BaseModel):
    agent_id: str


# ============================================================================
# Endpoints — Suites
# ============================================================================

@router.post(
    "/benchmarks/suites",
    summary="Create a benchmark suite",
    operation_id="create_benchmark_suite",
)
async def create_benchmark_suite(
    body: CreateBenchmarkSuiteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new benchmark suite for the authenticated user."""
    valid_scoring = ("average", "weighted", "min", "max")
    if body.scoring_method not in valid_scoring:
        raise HTTPException(status_code=400, detail=f"scoring_method must be one of {valid_scoring}")

    import json
    suite_id = str(uuid.uuid4())
    try:
        await execute_mutate(
            """
            INSERT INTO benchmark_suites
              (id, user_id, suite_name, description, test_cases, scoring_method)
            VALUES
              (:id, :user_id, :suite_name, :description, :test_cases, :scoring_method)
            """,
            {
                "id": suite_id,
                "user_id": user_id,
                "suite_name": body.suite_name,
                "description": body.description,
                "test_cases": json.dumps(body.test_cases),
                "scoring_method": body.scoring_method,
            },
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="A suite with that name already exists")
        logger.error(f"create_benchmark_suite error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create benchmark suite")

    row = await execute_one(
        "SELECT * FROM benchmark_suites WHERE id = :id", {"id": suite_id}
    )
    return serialize_row(row)


@router.get(
    "/benchmarks/suites",
    summary="List benchmark suites",
    operation_id="list_benchmark_suites",
)
async def list_benchmark_suites(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all benchmark suites for the authenticated user."""
    rows = await execute(
        "SELECT * FROM benchmark_suites WHERE user_id::text = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.get(
    "/benchmarks/suites/{suite_id}",
    summary="Get benchmark suite detail",
    operation_id="get_benchmark_suite",
)
async def get_benchmark_suite(
    suite_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single benchmark suite with full test_cases."""
    row = await execute_one(
        "SELECT * FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Benchmark suite not found")
    return serialize_row(row)


@router.patch(
    "/benchmarks/suites/{suite_id}",
    summary="Update a benchmark suite",
    operation_id="update_benchmark_suite",
)
async def update_benchmark_suite(
    suite_id: str,
    body: UpdateBenchmarkSuiteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update fields on an existing benchmark suite."""
    existing = await execute_one(
        "SELECT id FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Benchmark suite not found")

    import json
    updates = body.model_dump(exclude_none=True)
    if "test_cases" in updates:
        updates["test_cases"] = json.dumps(updates["test_cases"])

    if not updates:
        row = await execute_one("SELECT * FROM benchmark_suites WHERE id = :id", {"id": suite_id})
        return serialize_row(row)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "id": suite_id, "user_id": user_id}
    await execute_mutate(
        f"UPDATE benchmark_suites SET {set_clauses} WHERE id = :id AND user_id::text = :user_id",
        params,
    )
    row = await execute_one("SELECT * FROM benchmark_suites WHERE id = :id", {"id": suite_id})
    return serialize_row(row)


@router.delete(
    "/benchmarks/suites/{suite_id}",
    summary="Delete a benchmark suite",
    operation_id="delete_benchmark_suite",
)
async def delete_benchmark_suite(
    suite_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a benchmark suite (cascades to runs)."""
    existing = await execute_one(
        "SELECT id FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Benchmark suite not found")

    await execute_mutate(
        "DELETE FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    return {"deleted": True, "suite_id": suite_id}


# ============================================================================
# Endpoint — Run benchmark
# ============================================================================

@router.post(
    "/benchmarks/suites/{suite_id}/run",
    summary="Start a benchmark run",
    operation_id="run_benchmark_suite",
)
async def run_benchmark_suite(
    suite_id: str,
    body: RunBenchmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Simulate a benchmark run for the given agent against the suite."""
    import json

    suite_row = await execute_one(
        "SELECT * FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    if not suite_row:
        raise HTTPException(status_code=404, detail="Benchmark suite not found")

    suite = serialize_row(suite_row)
    test_cases = suite.get("test_cases", [])
    if isinstance(test_cases, str):
        test_cases = json.loads(test_cases)

    if not test_cases:
        raise HTTPException(status_code=400, detail="Suite has no test cases to run")

    start = time.time()
    results: List[Dict[str, Any]] = []
    for tc in test_cases:
        score = random.uniform(60, 100)
        passed = score >= 70
        results.append({
            "name": tc.get("name", "test"),
            "score": round(score, 2),
            "passed": passed,
            "latency_ms": random.randint(100, 3000),
        })

    overall_score = sum(r["score"] for r in results) / len(results)
    passed_count = sum(1 for r in results if r["passed"])
    failed_count = len(results) - passed_count
    duration_ms = int((time.time() - start) * 1000) + random.randint(500, 5000)
    now = datetime.now(timezone.utc)

    run_id = str(uuid.uuid4())
    await execute_mutate(
        """
        INSERT INTO benchmark_runs
          (id, suite_id, user_id, agent_id, status, overall_score, test_results,
           total_tests, passed_tests, failed_tests, duration_ms, completed_at)
        VALUES
          (:id, :suite_id, :user_id, :agent_id, 'completed', :overall_score, :test_results,
           :total_tests, :passed_tests, :failed_tests, :duration_ms, :completed_at)
        """,
        {
            "id": run_id,
            "suite_id": suite_id,
            "user_id": user_id,
            "agent_id": body.agent_id,
            "overall_score": round(overall_score, 2),
            "test_results": json.dumps(results),
            "total_tests": len(results),
            "passed_tests": passed_count,
            "failed_tests": failed_count,
            "duration_ms": duration_ms,
            "completed_at": now.isoformat(),
        },
    )

    run_row = await execute_one("SELECT * FROM benchmark_runs WHERE id = :id", {"id": run_id})
    return serialize_row(run_row)


# ============================================================================
# Endpoints — Runs
# ============================================================================

@router.get(
    "/benchmarks/runs",
    summary="List benchmark runs",
    operation_id="list_benchmark_runs",
)
async def list_benchmark_runs(
    agent_id: Optional[str] = Query(default=None),
    suite_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List benchmark runs with optional filters."""
    conditions = ["r.user_id::text = :user_id"]
    params: dict = {"user_id": user_id, "limit": limit}

    if agent_id:
        conditions.append("r.agent_id::text = :agent_id")
        params["agent_id"] = agent_id
    if suite_id:
        conditions.append("r.suite_id::text = :suite_id")
        params["suite_id"] = suite_id

    where_clause = " AND ".join(conditions)
    rows = await execute(
        f"""
        SELECT r.*, s.suite_name
        FROM benchmark_runs r
        JOIN benchmark_suites s ON s.id::text = r.suite_id::text
        WHERE {where_clause}
        ORDER BY r.started_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/benchmarks/runs/{run_id}",
    summary="Get run detail",
    operation_id="get_benchmark_run",
)
async def get_benchmark_run(
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get full benchmark run detail including test_results."""
    row = await execute_one(
        """
        SELECT r.*, s.suite_name
        FROM benchmark_runs r
        JOIN benchmark_suites s ON s.id::text = r.suite_id::text
        WHERE r.id::text = :run_id AND r.user_id::text = :user_id
        """,
        {"run_id": run_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    return serialize_row(row)


@router.get(
    "/benchmarks/suites/{suite_id}/leaderboard",
    summary="Suite leaderboard",
    operation_id="get_benchmark_leaderboard",
)
async def get_benchmark_leaderboard(
    suite_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return runs for a suite sorted by overall_score DESC."""
    suite_row = await execute_one(
        "SELECT id FROM benchmark_suites WHERE id = :id AND user_id::text = :user_id",
        {"id": suite_id, "user_id": user_id},
    )
    if not suite_row:
        raise HTTPException(status_code=404, detail="Benchmark suite not found")

    rows = await execute(
        """
        SELECT r.id, r.agent_id, r.overall_score, r.passed_tests, r.total_tests,
               r.duration_ms, r.status, r.started_at, r.completed_at
        FROM benchmark_runs r
        WHERE r.suite_id::text = :suite_id AND r.user_id::text = :user_id AND r.status = 'completed'
        ORDER BY r.overall_score DESC
        LIMIT 50
        """,
        {"suite_id": suite_id, "user_id": user_id},
    )
    return {"suite_id": suite_id, "leaderboard": serialize_rows(rows)}
