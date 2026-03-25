"""
Real-time run monitor API endpoints.

Provides active run listing, per-run timeline snapshots, aggregate stats,
and snapshot recording for live agent run monitoring.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/monitor", tags=["run-monitor"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ActiveRun(BaseModel):
    run_id: str
    agent_id: str
    agent_name: Optional[str] = None
    status: str
    current_tool: Optional[str] = None
    step_count: int = 0
    tokens_used: int = 0
    cost_so_far: float = 0
    elapsed_ms: int = 0
    started_at: Optional[str] = None


class RunSnapshot(BaseModel):
    id: str
    run_id: str
    agent_id: str
    status: str
    step_count: int = 0
    current_tool: Optional[str] = None
    tokens_used: int = 0
    cost_so_far: float = 0
    elapsed_ms: int = 0
    error: Optional[str] = None
    captured_at: str


class MonitorStats(BaseModel):
    active_runs: int = 0
    avg_latency_ms: float = 0
    errors_today: int = 0
    cost_today: float = 0


class SnapshotRequest(BaseModel):
    agent_id: str
    status: str
    step_count: int = 0
    current_tool: Optional[str] = None
    tokens_used: int = 0
    cost_so_far: float = 0
    elapsed_ms: int = 0
    error: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/", summary="Monitor overview (trailing slash)", operation_id="monitor_overview_slash", include_in_schema=False)
@router.get("", summary="Monitor overview", operation_id="monitor_overview")
async def monitor_overview(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Return a summary of monitoring status."""
    return {
        "status": "ok",
        "endpoints": ["/monitor/runs/active", "/monitor/health", "/monitor/alerts"],
    }


@router.get(
    "/runs/active",
    response_model=List[ActiveRun],
    summary="List Active Runs",
    operation_id="list_active_runs",
)
async def list_active_runs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List currently running agent runs for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT
                ar.id::text AS run_id,
                ar.agent_id::text AS agent_id,
                a.name AS agent_name,
                ar.status,
                ar.started_at
            FROM agent_runs ar
            LEFT JOIN agents a ON a.agent_id::text = ar.agent_id::text
            WHERE ar.user_id::text = :user_id
              AND ar.status = 'running'
            ORDER BY ar.started_at DESC
            LIMIT 50
            """,
            {"user_id": user_id},
        )

        active_runs: list[dict] = []
        for row in rows:
            # Get latest snapshot for each run to enrich with live data
            snapshot = await execute_one(
                """
                SELECT step_count, current_tool, tokens_used, cost_so_far, elapsed_ms
                FROM run_monitor_snapshots
                WHERE run_id::text = :run_id AND user_id::text = :user_id
                ORDER BY captured_at DESC
                LIMIT 1
                """,
                {"run_id": str(row["run_id"]), "user_id": user_id},
            )

            run_data = {
                "run_id": str(row["run_id"]),
                "agent_id": row["agent_id"],
                "agent_name": row.get("agent_name"),
                "status": row["status"],
                "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
                "current_tool": snapshot["current_tool"] if snapshot else None,
                "step_count": snapshot["step_count"] if snapshot else 0,
                "tokens_used": snapshot["tokens_used"] if snapshot else 0,
                "cost_so_far": float(snapshot["cost_so_far"]) if snapshot else 0,
                "elapsed_ms": snapshot["elapsed_ms"] if snapshot else 0,
            }
            active_runs.append(run_data)

        return active_runs

    except Exception as e:
        logger.error(f"Error listing active runs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list active runs")


@router.get(
    "/runs/{run_id}/timeline",
    response_model=List[RunSnapshot],
    summary="Get Run Timeline",
    operation_id="get_run_timeline",
)
async def get_run_timeline(
    run_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the timeline of snapshots for a specific run."""
    try:
        rows = await execute(
            """
            SELECT id, run_id, agent_id, status, step_count, current_tool,
                   tokens_used, cost_so_far, elapsed_ms, error, captured_at
            FROM run_monitor_snapshots
            WHERE run_id::text = :run_id AND user_id::text = :user_id
            ORDER BY captured_at ASC
            LIMIT :limit
            """,
            {"run_id": run_id, "user_id": user_id, "limit": limit},
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error fetching run timeline for {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch run timeline")


@router.get(
    "/stats",
    response_model=MonitorStats,
    summary="Get Monitor Stats",
    operation_id="get_monitor_stats",
)
async def get_monitor_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get real-time monitoring stats: active runs, avg latency, errors and cost today."""
    try:
        # Active runs count
        active_row = await execute_one(
            """
            SELECT COUNT(*) AS cnt
            FROM agent_runs
            WHERE user_id::text = :user_id AND status = 'running'
            """,
            {"user_id": user_id},
        )
        active_runs = active_row["cnt"] if active_row else 0

        # Today's stats from agent_runs
        today_row = await execute_one(
            """
            SELECT
                COALESCE(AVG(
                    CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
                    END
                ), 0) AS avg_latency_ms,
                COALESCE(SUM(CASE WHEN status IN ('error', 'failed') THEN 1 ELSE 0 END), 0) AS errors_today,
                COALESCE(SUM(cost), 0) AS cost_today
            FROM agent_runs
            WHERE user_id::text = :user_id
              AND started_at >= CURRENT_DATE
            """,
            {"user_id": user_id},
        )

        return MonitorStats(
            active_runs=active_runs,
            avg_latency_ms=float(today_row["avg_latency_ms"]) if today_row else 0,
            errors_today=int(today_row["errors_today"]) if today_row else 0,
            cost_today=float(today_row["cost_today"]) if today_row else 0,
        )

    except Exception as e:
        logger.error(f"Error fetching monitor stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch monitor stats")


@router.post(
    "/runs/{run_id}/snapshot",
    summary="Record Run Snapshot",
    operation_id="record_run_snapshot",
)
async def record_run_snapshot(
    run_id: str,
    body: SnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a point-in-time snapshot for a running agent run."""
    try:
        rows = await execute_mutate(
            """
            INSERT INTO run_monitor_snapshots
                (user_id, agent_id, run_id, status, step_count, current_tool,
                 tokens_used, cost_so_far, elapsed_ms, error)
            VALUES
                (:user_id, :agent_id, :run_id, :status, :step_count, :current_tool,
                 :tokens_used, :cost_so_far, :elapsed_ms, :error)
            RETURNING id, captured_at
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "run_id": run_id,
                "status": body.status,
                "step_count": body.step_count,
                "current_tool": body.current_tool,
                "tokens_used": body.tokens_used,
                "cost_so_far": body.cost_so_far,
                "elapsed_ms": body.elapsed_ms,
                "error": body.error,
            },
        )

        if rows:
            return {
                "success": True,
                "id": str(rows[0]["id"]),
                "captured_at": rows[0]["captured_at"].isoformat() if hasattr(rows[0]["captured_at"], "isoformat") else str(rows[0]["captured_at"]),
            }

        return {"success": True}

    except Exception as e:
        logger.error(f"Error recording snapshot for run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record snapshot")


@router.get("/health", summary="Monitor health check", operation_id="monitor_health")
async def monitor_health(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Return health status of the monitoring system."""
    return {"status": "healthy", "monitoring": True}


@router.get("/alerts", summary="List monitor alerts", operation_id="list_alerts")
async def list_alerts(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """List active monitoring alerts."""
    return {"alerts": [], "total": 0}
