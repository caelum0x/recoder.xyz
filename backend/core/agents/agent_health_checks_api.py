"""
Agent Health Checks API endpoints.

Provides health check configuration, result recording, uptime tracking,
and overview for agent-specific health monitoring.
"""

import uuid
import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-health-checks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateHealthCheckRequest(BaseModel):
    check_name: str
    check_type: str = "ping"
    check_config: Dict[str, Any] = Field(default_factory=dict)
    interval_minutes: int = Field(default=60, ge=1)
    timeout_seconds: int = Field(default=30, ge=1)
    failure_threshold: int = Field(default=3, ge=1)


class UpdateHealthCheckRequest(BaseModel):
    check_name: Optional[str] = None
    check_type: Optional[str] = None
    check_config: Optional[Dict[str, Any]] = None
    interval_minutes: Optional[int] = Field(default=None, ge=1)
    timeout_seconds: Optional[int] = Field(default=None, ge=1)
    failure_threshold: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None


# ============================================================================
# Endpoints — Overview (no agent_id prefix)
# ============================================================================

@router.get(
    "/health-overview",
    summary="All agents health overview",
    operation_id="get_health_overview",
)
async def get_health_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return uptime summaries for all agents belonging to the user."""
    rows = await execute(
        """
        SELECT * FROM agent_uptime_summary
        WHERE user_id::text = :user_id
        ORDER BY last_checked_at DESC NULLS LAST
        """,
        {"user_id": user_id},
    )
    return serialize_rows(rows)


# ============================================================================
# Endpoints — Per-agent
# ============================================================================

@router.post(
    "/agents/{agent_id}/health-checks",
    summary="Create health check config",
    operation_id="create_health_check",
)
async def create_health_check(
    agent_id: str,
    body: CreateHealthCheckRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a health check configuration for an agent."""
    config_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO health_check_configs
              (id, user_id, agent_id, check_name, check_type, check_config,
               interval_minutes, timeout_seconds, failure_threshold)
            VALUES
              (:id, :user_id, :agent_id, :check_name, :check_type, :check_config::jsonb,
               :interval_minutes, :timeout_seconds, :failure_threshold)
            RETURNING *
            """,
            {
                "id": config_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "check_name": body.check_name,
                "check_type": body.check_type,
                "check_config": str(body.check_config).replace("'", '"'),
                "interval_minutes": body.interval_minutes,
                "timeout_seconds": body.timeout_seconds,
                "failure_threshold": body.failure_threshold,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"create_health_check error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create health check config")


@router.get(
    "/agents/{agent_id}/health-checks",
    summary="List health check configs",
    operation_id="list_health_checks",
)
async def list_health_checks(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List health check configs for an agent, including last result status."""
    rows = await execute(
        """
        SELECT
          hcc.*,
          hcr.status      AS last_status,
          hcr.checked_at  AS last_checked_at,
          hcr.response_time_ms AS last_response_time_ms
        FROM health_check_configs hcc
        LEFT JOIN LATERAL (
          SELECT status, checked_at, response_time_ms
          FROM health_check_results
          WHERE config_id = hcc.id
          ORDER BY checked_at DESC
          LIMIT 1
        ) hcr ON true
        WHERE hcc.agent_id::text = :agent_id AND hcc.user_id::text = :user_id
        ORDER BY hcc.created_at DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return serialize_rows(rows)


@router.patch(
    "/agents/{agent_id}/health-checks/{config_id}",
    summary="Update health check config",
    operation_id="update_health_check",
)
async def update_health_check(
    agent_id: str,
    config_id: str,
    body: UpdateHealthCheckRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a health check configuration."""
    existing = await execute_one(
        "SELECT * FROM health_check_configs WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
        {"id": config_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Health check config not found")

    data = body.model_dump(exclude_none=True)
    if not data:
        return serialize_row(existing)

    set_clauses = ", ".join(f"{k} = :{k}" for k in data)
    data["id"] = config_id
    data["agent_id"] = agent_id
    data["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE health_check_configs SET {set_clauses}
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        RETURNING *
        """,
        data,
    )
    return serialize_row(row)


@router.delete(
    "/agents/{agent_id}/health-checks/{config_id}",
    summary="Delete health check config",
    operation_id="delete_health_check",
)
async def delete_health_check(
    agent_id: str,
    config_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a health check configuration."""
    existing = await execute_one(
        "SELECT id FROM health_check_configs WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
        {"id": config_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Health check config not found")

    await execute_mutate(
        "DELETE FROM health_check_configs WHERE id = :id AND user_id::text = :user_id",
        {"id": config_id, "user_id": user_id},
    )
    return {"deleted": True, "id": config_id}


@router.post(
    "/agents/{agent_id}/health-checks/{config_id}/run",
    summary="Run health check now",
    operation_id="run_health_check",
)
async def run_health_check(
    agent_id: str,
    config_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Simulate running a health check and record result. Updates uptime summary."""
    config = await execute_one(
        "SELECT * FROM health_check_configs WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
        {"id": config_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not config:
        raise HTTPException(status_code=404, detail="Health check config not found")

    timeout_seconds = config["timeout_seconds"] or 30

    # Simulate check
    response_time_ms = random.randint(50, 2000)
    if response_time_ms > timeout_seconds * 1000:
        status = "timeout"
    elif response_time_ms > 1500:
        status = "degraded"
    else:
        status = "healthy"

    result_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    try:
        result_row = await execute_one(
            """
            INSERT INTO health_check_results
              (id, config_id, user_id, agent_id, status, response_time_ms, details)
            VALUES
              (:id, :config_id, :user_id, :agent_id, :status, :response_time_ms, '{}'::jsonb)
            RETURNING *
            """,
            {
                "id": result_id,
                "config_id": config_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "status": status,
                "response_time_ms": response_time_ms,
            },
        )
    except Exception as exc:
        logger.error(f"run_health_check insert result error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record health check result")

    # Upsert uptime summary
    try:
        existing_summary = await execute_one(
            "SELECT * FROM agent_uptime_summary WHERE user_id::text = :user_id AND agent_id::text = :agent_id",
            {"user_id": user_id, "agent_id": agent_id},
        )
        if existing_summary:
            total = (existing_summary["total_checks"] or 0) + 1
            failed = (existing_summary["failed_checks"] or 0) + (0 if status == "healthy" else 1)
            uptime_pct = round(((total - failed) / total) * 100, 2)
            prev_avg = existing_summary["avg_response_ms"] or 0
            avg_response_ms = round((prev_avg * (total - 1) + response_time_ms) / total)
            await execute_mutate(
                """
                UPDATE agent_uptime_summary SET
                  uptime_pct = :uptime_pct,
                  total_checks = :total,
                  failed_checks = :failed,
                  avg_response_ms = :avg_response_ms,
                  last_status = :last_status,
                  last_checked_at = now(),
                  updated_at = now()
                WHERE user_id::text = :user_id AND agent_id::text = :agent_id
                """,
                {
                    "uptime_pct": uptime_pct,
                    "total": total,
                    "failed": failed,
                    "avg_response_ms": avg_response_ms,
                    "last_status": status,
                    "user_id": user_id,
                    "agent_id": agent_id,
                },
            )
        else:
            failed = 0 if status == "healthy" else 1
            uptime_pct = 100.0 if status == "healthy" else 0.0
            summary_id = str(uuid.uuid4())
            await execute_mutate(
                """
                INSERT INTO agent_uptime_summary
                  (id, user_id, agent_id, uptime_pct, total_checks, failed_checks,
                   avg_response_ms, last_status, last_checked_at)
                VALUES
                  (:id, :user_id, :agent_id, :uptime_pct, 1, :failed,
                   :avg_response_ms, :last_status, now())
                """,
                {
                    "id": summary_id,
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "uptime_pct": uptime_pct,
                    "failed": failed,
                    "avg_response_ms": response_time_ms,
                    "last_status": status,
                },
            )
    except Exception as exc:
        logger.error(f"run_health_check upsert summary error: {exc}")
        # Non-fatal: result already recorded

    return serialize_row(result_row)


@router.get(
    "/agents/{agent_id}/health-checks/{config_id}/results",
    summary="List health check results",
    operation_id="get_health_results",
)
async def get_health_results(
    agent_id: str,
    config_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    status: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List results for a health check config."""
    config = await execute_one(
        "SELECT id FROM health_check_configs WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
        {"id": config_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not config:
        raise HTTPException(status_code=404, detail="Health check config not found")

    params: Dict[str, Any] = {"config_id": config_id, "user_id": user_id, "limit": limit}
    extra = ""
    if status:
        extra = " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM health_check_results
        WHERE config_id::text = :config_id AND user_id::text = :user_id{extra}
        ORDER BY checked_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/agents/{agent_id}/uptime",
    summary="Get agent uptime summary",
    operation_id="get_agent_uptime",
)
async def get_agent_uptime(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return the uptime summary for a specific agent."""
    row = await execute_one(
        "SELECT * FROM agent_uptime_summary WHERE user_id::text = :user_id AND agent_id::text = :agent_id",
        {"user_id": user_id, "agent_id": agent_id},
    )
    if not row:
        return {
            "agent_id": agent_id,
            "uptime_pct": 100.0,
            "total_checks": 0,
            "failed_checks": 0,
            "avg_response_ms": 0,
            "last_status": "healthy",
            "last_checked_at": None,
        }
    return serialize_row(row)
