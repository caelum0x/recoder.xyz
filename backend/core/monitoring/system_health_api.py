"""
System Health Dashboard API.

Provides health check execution, status retrieval, history tracking,
and uptime calculations for core platform services (database, backend API, agent runtime).
"""

import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/health-dashboard", tags=["system-health"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ServiceHealthStatus(BaseModel):
    service_name: str
    status: str = "unknown"
    response_time_ms: int = 0
    details: Dict[str, Any] = Field(default_factory=dict)
    checked_at: Optional[str] = None


class HealthCheckResponse(BaseModel):
    services: List[ServiceHealthStatus]
    overall_status: str = "unknown"
    checked_at: str


class HealthHistoryItem(BaseModel):
    id: str
    service_name: str
    status: str
    response_time_ms: Optional[int] = None
    checked_at: str


class UptimeItem(BaseModel):
    service_name: str
    uptime_percentage: float
    total_checks: int
    healthy_checks: int


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


async def _check_database() -> ServiceHealthStatus:
    """Run a lightweight database health check."""
    start = time.monotonic()
    try:
        result = await execute_one("SELECT 1 AS ok")
        elapsed_ms = int((time.monotonic() - start) * 1000)

        if result and result.get("ok") == 1:
            return ServiceHealthStatus(
                service_name="database",
                status="healthy",
                response_time_ms=elapsed_ms,
                details={"query": "SELECT 1", "result": "ok"},
            )
        else:
            return ServiceHealthStatus(
                service_name="database",
                status="degraded",
                response_time_ms=elapsed_ms,
                details={"query": "SELECT 1", "result": "unexpected"},
            )
    except Exception as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceHealthStatus(
            service_name="database",
            status="down",
            response_time_ms=elapsed_ms,
            details={"error": str(e)},
        )


async def _check_backend_api() -> ServiceHealthStatus:
    """Self-check for the backend API (if we can execute this, the API is running)."""
    start = time.monotonic()
    try:
        import os
        import asyncio

        # Simple self-check: if this code is executing, the backend is up.
        # Also verify we can access config
        from core.utils.config import config
        elapsed_ms = int((time.monotonic() - start) * 1000)

        details: Dict[str, Any] = {
            "env_mode": config.ENV_MODE.value if config.ENV_MODE else "unknown",
            "pid": os.getpid(),
        }

        # If response is very slow, mark as degraded
        if elapsed_ms > 1000:
            return ServiceHealthStatus(
                service_name="backend_api",
                status="degraded",
                response_time_ms=elapsed_ms,
                details={**details, "note": "slow self-check"},
            )

        return ServiceHealthStatus(
            service_name="backend_api",
            status="healthy",
            response_time_ms=elapsed_ms,
            details=details,
        )
    except Exception as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceHealthStatus(
            service_name="backend_api",
            status="down",
            response_time_ms=elapsed_ms,
            details={"error": str(e)},
        )


async def _check_agent_runtime() -> ServiceHealthStatus:
    """Check agent runtime connectivity by verifying the agents table is accessible."""
    start = time.monotonic()
    try:
        result = await execute_one(
            "SELECT COUNT(*) AS agent_count FROM agents LIMIT 1"
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        if result is not None:
            return ServiceHealthStatus(
                service_name="agent_runtime",
                status="healthy",
                response_time_ms=elapsed_ms,
                details={"agents_accessible": True, "agent_count": result.get("agent_count", 0)},
            )
        else:
            return ServiceHealthStatus(
                service_name="agent_runtime",
                status="degraded",
                response_time_ms=elapsed_ms,
                details={"agents_accessible": False},
            )
    except Exception as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ServiceHealthStatus(
            service_name="agent_runtime",
            status="down",
            response_time_ms=elapsed_ms,
            details={"error": str(e)},
        )


def _compute_overall_status(services: List[ServiceHealthStatus]) -> str:
    """Compute overall status from individual service statuses."""
    statuses = [s.status for s in services]
    if any(s == "down" for s in statuses):
        return "down"
    if any(s == "degraded" for s in statuses):
        return "degraded"
    if all(s == "healthy" for s in statuses):
        return "healthy"
    return "unknown"


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/check",
    summary="Run Health Check",
    operation_id="run_health_check",
)
async def run_health_check(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Run health checks for all core services (database, backend API, agent runtime).
    Upserts into system_health_checks and appends to history.
    """
    try:
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Run all checks
        db_check = await _check_database()
        api_check = await _check_backend_api()
        runtime_check = await _check_agent_runtime()

        services = [db_check, api_check, runtime_check]
        overall = _compute_overall_status(services)

        # Persist results: upsert into system_health_checks and append to history
        for svc in services:
            svc.checked_at = now_iso

            # Upsert latest check
            try:
                import json
                await execute_mutate(
                    """
                    INSERT INTO system_health_checks (user_id, service_name, status, response_time_ms, details, checked_at)
                    VALUES (:user_id, :service_name, :status, :response_time_ms, :details::jsonb, :checked_at)
                    ON CONFLICT (user_id, service_name)
                    DO UPDATE SET
                        status = EXCLUDED.status,
                        response_time_ms = EXCLUDED.response_time_ms,
                        details = EXCLUDED.details,
                        checked_at = EXCLUDED.checked_at
                    """,
                    {
                        "user_id": user_id,
                        "service_name": svc.service_name,
                        "status": svc.status,
                        "response_time_ms": svc.response_time_ms,
                        "details": json.dumps(svc.details),
                        "checked_at": now,
                    },
                )
            except Exception as upsert_err:
                # If upsert fails (e.g. no unique constraint yet), try plain insert
                logger.warning(f"Health check upsert failed, trying insert: {upsert_err}")
                await execute_mutate(
                    """
                    INSERT INTO system_health_checks (user_id, service_name, status, response_time_ms, details, checked_at)
                    VALUES (:user_id, :service_name, :status, :response_time_ms, :details::jsonb, :checked_at)
                    """,
                    {
                        "user_id": user_id,
                        "service_name": svc.service_name,
                        "status": svc.status,
                        "response_time_ms": svc.response_time_ms,
                        "details": json.dumps(svc.details),
                        "checked_at": now,
                    },
                )

            # Append to history
            await execute_mutate(
                """
                INSERT INTO system_health_history (user_id, service_name, status, response_time_ms, checked_at)
                VALUES (:user_id, :service_name, :status, :response_time_ms, :checked_at)
                """,
                {
                    "user_id": user_id,
                    "service_name": svc.service_name,
                    "status": svc.status,
                    "response_time_ms": svc.response_time_ms,
                    "checked_at": now,
                },
            )

        return {
            "services": [s.model_dump() for s in services],
            "overall_status": overall,
            "checked_at": now_iso,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running health check for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get(
    "/status",
    summary="Get Health Status",
    operation_id="get_health_status",
)
async def get_health_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the latest health status for all services."""
    try:
        rows = await execute(
            """
            SELECT id, service_name, status, response_time_ms, details, checked_at
            FROM system_health_checks
            WHERE user_id::text = :user_id
            ORDER BY checked_at DESC
            """,
            {"user_id": user_id},
        )

        services = []
        for row in (rows or []):
            services.append({
                "service_name": row["service_name"],
                "status": row["status"],
                "response_time_ms": row.get("response_time_ms"),
                "details": row.get("details") or {},
                "checked_at": _ts(row.get("checked_at")),
            })

        # Compute overall
        statuses = [s["status"] for s in services]
        if any(s == "down" for s in statuses):
            overall = "down"
        elif any(s == "degraded" for s in statuses):
            overall = "degraded"
        elif all(s == "healthy" for s in statuses):
            overall = "healthy"
        else:
            overall = "unknown"

        return {
            "services": services,
            "overall_status": overall,
        }

    except Exception as e:
        logger.error(f"Error fetching health status for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch health status")


@router.get(
    "/history",
    summary="Get Health History",
    operation_id="get_health_history",
)
async def get_health_history(
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    hours: int = Query(24, ge=1, le=720, description="Hours of history to retrieve"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get health history for charting. Filterable by service and time window."""
    try:
        params: Dict[str, Any] = {"user_id": user_id, "hours": hours}

        where_clause = "WHERE user_id::text = :user_id AND checked_at >= now() - make_interval(hours => :hours)"
        if service_name:
            where_clause += " AND service_name = :service_name"
            params["service_name"] = service_name

        rows = await execute(
            f"""
            SELECT id, service_name, status, response_time_ms, checked_at
            FROM system_health_history
            {where_clause}
            ORDER BY checked_at DESC
            LIMIT 1000
            """,
            params,
        )

        history = []
        for row in (rows or []):
            history.append({
                "id": str(row["id"]),
                "service_name": row["service_name"],
                "status": row["status"],
                "response_time_ms": row.get("response_time_ms"),
                "checked_at": _ts(row.get("checked_at")),
            })

        return {"history": history, "count": len(history)}

    except Exception as e:
        logger.error(f"Error fetching health history for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch health history")


@router.get(
    "/uptime",
    summary="Get Service Uptime",
    operation_id="get_service_uptime",
)
async def get_service_uptime(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Calculate uptime percentage per service over the last 30 days.
    Uptime = (healthy + degraded checks) / total checks * 100.
    """
    try:
        rows = await execute(
            """
            SELECT
                service_name,
                COUNT(*) AS total_checks,
                COUNT(*) FILTER (WHERE status IN ('healthy', 'degraded')) AS healthy_checks
            FROM system_health_history
            WHERE user_id::text = :user_id
              AND checked_at >= now() - interval '30 days'
            GROUP BY service_name
            ORDER BY service_name
            """,
            {"user_id": user_id},
        )

        uptimes = []
        for row in (rows or []):
            total = row["total_checks"] or 0
            healthy = row["healthy_checks"] or 0
            pct = round((healthy / total * 100), 2) if total > 0 else 0.0

            uptimes.append({
                "service_name": row["service_name"],
                "uptime_percentage": pct,
                "total_checks": total,
                "healthy_checks": healthy,
            })

        return {"uptimes": uptimes}

    except Exception as e:
        logger.error(f"Error calculating uptime for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate uptime")
