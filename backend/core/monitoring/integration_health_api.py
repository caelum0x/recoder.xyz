"""
Integration Health API endpoints.

Provides endpoint registration, health check simulation, uptime tracking, and history.
Access control enforced at application layer (WHERE user_id::text = :user_id).
"""

import uuid
import random
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["integration-health"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RegisterEndpointRequest(BaseModel):
    endpoint_name: str
    endpoint_url: str
    integration_type: Optional[str] = "webhook"
    check_interval_minutes: Optional[int] = Field(default=60, ge=1)
    timeout_seconds: Optional[int] = Field(default=10, ge=1)
    expected_status_code: Optional[int] = Field(default=200)
    auth_header: Optional[str] = None
    is_active: Optional[bool] = True


class UpdateEndpointRequest(BaseModel):
    endpoint_name: Optional[str] = None
    endpoint_url: Optional[str] = None
    integration_type: Optional[str] = None
    check_interval_minutes: Optional[int] = Field(default=None, ge=1)
    timeout_seconds: Optional[int] = Field(default=None, ge=1)
    expected_status_code: Optional[int] = None
    auth_header: Optional[str] = None
    is_active: Optional[bool] = None


# ============================================================================
# Helper
# ============================================================================

def _endpoint_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Endpoint not found")


# ============================================================================
# Endpoints — Register
# ============================================================================

@router.post("/integrations/endpoints", summary="Register Integration Endpoint", operation_id="register_integration_endpoint")
async def register_endpoint(
    body: RegisterEndpointRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> dict[str, Any]:
    endpoint_id = str(uuid.uuid4())
    try:
        await execute_mutate(
            """
            INSERT INTO integration_endpoints
                (id, user_id, endpoint_name, endpoint_url, integration_type,
                 check_interval_minutes, timeout_seconds, expected_status_code,
                 auth_header, is_active)
            VALUES
                (:id, :user_id, :endpoint_name, :endpoint_url, :integration_type,
                 :check_interval_minutes, :timeout_seconds, :expected_status_code,
                 :auth_header, :is_active)
            """,
            {
                "id": endpoint_id,
                "user_id": user_id,
                "endpoint_name": body.endpoint_name,
                "endpoint_url": body.endpoint_url,
                "integration_type": body.integration_type or "webhook",
                "check_interval_minutes": body.check_interval_minutes or 60,
                "timeout_seconds": body.timeout_seconds or 10,
                "expected_status_code": body.expected_status_code or 200,
                "auth_header": body.auth_header,
                "is_active": body.is_active if body.is_active is not None else True,
            },
        )
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="An endpoint with this name already exists")
        logger.error(f"register_endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to register endpoint")

    row = await execute_one(
        "SELECT * FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    return serialize_row(row)


# ============================================================================
# Endpoints — Overview & Stats (BEFORE /{endpoint_id} routes)
# ============================================================================

@router.get("/integrations/overview", summary="Integration Overview", operation_id="get_integration_overview")
async def get_integration_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> list[dict[str, Any]]:
    rows = await execute(
        """
        SELECT
            e.id,
            e.endpoint_name,
            e.endpoint_url,
            e.integration_type,
            e.check_interval_minutes,
            e.timeout_seconds,
            e.expected_status_code,
            e.is_active,
            e.created_at,
            COALESCE(u.uptime_pct, 100)        AS uptime_pct,
            COALESCE(u.total_checks, 0)        AS total_checks,
            COALESCE(u.failed_checks, 0)       AS failed_checks,
            COALESCE(u.avg_response_ms, 0)     AS avg_response_ms,
            COALESCE(u.last_status, 'healthy') AS last_status,
            u.updated_at                        AS last_checked_at
        FROM integration_endpoints e
        LEFT JOIN integration_uptime u
               ON u.endpoint_id::text = e.id::text AND u.user_id::text = e.user_id::text
        WHERE e.user_id::text = :user_id
        ORDER BY e.created_at DESC
        """,
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.get("/integrations/stats", summary="Integration Stats", operation_id="get_integration_stats")
async def get_integration_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> dict[str, Any]:
    row = await execute_one(
        """
        SELECT
            COUNT(e.id)                                                          AS total_endpoints,
            COUNT(CASE WHEN COALESCE(u.last_status, 'healthy') = 'healthy'  THEN 1 END) AS healthy_count,
            COUNT(CASE WHEN COALESCE(u.last_status, 'healthy') = 'degraded' THEN 1 END) AS degraded_count,
            COUNT(CASE WHEN COALESCE(u.last_status, 'healthy') IN ('down', 'timeout') THEN 1 END) AS down_count,
            COALESCE(AVG(COALESCE(u.uptime_pct, 100)), 100)                     AS overall_avg_uptime
        FROM integration_endpoints e
        LEFT JOIN integration_uptime u
               ON u.endpoint_id::text = e.id::text AND u.user_id::text = e.user_id::text
        WHERE e.user_id::text = :user_id
        """,
        {"user_id": user_id},
    )
    if row is None:
        return {
            "total_endpoints": 0,
            "healthy_count": 0,
            "degraded_count": 0,
            "down_count": 0,
            "overall_avg_uptime": 100.0,
        }
    return serialize_row(row)


# ============================================================================
# Endpoints — List / Update / Delete
# ============================================================================

@router.get("/integrations/endpoints", summary="List Integration Endpoints", operation_id="list_integration_endpoints")
async def list_endpoints(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> list[dict[str, Any]]:
    rows = await execute(
        "SELECT * FROM integration_endpoints WHERE user_id::text = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.patch("/integrations/endpoints/{endpoint_id}", summary="Update Integration Endpoint", operation_id="update_integration_endpoint")
async def update_endpoint(
    endpoint_id: str,
    body: UpdateEndpointRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> dict[str, Any]:
    existing = await execute_one(
        "SELECT id FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    if not existing:
        raise _endpoint_not_found()

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {"id": endpoint_id, "user_id": user_id, **updates}

    await execute_mutate(
        f"UPDATE integration_endpoints SET {set_clauses} WHERE id = :id AND user_id::text = :user_id",
        params,
    )
    row = await execute_one(
        "SELECT * FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    return serialize_row(row)


@router.delete("/integrations/endpoints/{endpoint_id}", summary="Delete Integration Endpoint", operation_id="delete_integration_endpoint")
async def delete_endpoint(
    endpoint_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> dict[str, Any]:
    existing = await execute_one(
        "SELECT id FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    if not existing:
        raise _endpoint_not_found()

    await execute_mutate(
        "DELETE FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    return {"deleted": True, "id": endpoint_id}


# ============================================================================
# Endpoint — Simulate Check
# ============================================================================

@router.post("/integrations/endpoints/{endpoint_id}/check", summary="Run Integration Check", operation_id="run_integration_check")
async def run_integration_check(
    endpoint_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> dict[str, Any]:
    endpoint = await execute_one(
        "SELECT * FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    if not endpoint:
        raise _endpoint_not_found()

    timeout_seconds = endpoint["timeout_seconds"] or 10
    timeout_ms = timeout_seconds * 1000

    response_time_ms = random.randint(20, 3000)

    if response_time_ms > timeout_ms:
        status = "timeout"
        error_message = f"Request timed out after {timeout_seconds}s"
    elif response_time_ms > 2000:
        status = "degraded"
        error_message = None
    else:
        status = "healthy"
        error_message = None

    check_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    await execute_mutate(
        """
        INSERT INTO integration_health_checks
            (id, endpoint_id, user_id, status, response_time_ms, status_code, error_message, checked_at)
        VALUES
            (:id, :endpoint_id, :user_id, :status, :response_time_ms, :status_code, :error_message, :checked_at)
        """,
        {
            "id": check_id,
            "endpoint_id": endpoint_id,
            "user_id": user_id,
            "status": status,
            "response_time_ms": response_time_ms,
            "status_code": endpoint["expected_status_code"] if status != "timeout" else None,
            "error_message": error_message,
            "checked_at": now,
        },
    )

    # Upsert integration_uptime
    existing_uptime = await execute_one(
        "SELECT * FROM integration_uptime WHERE endpoint_id::text = :endpoint_id AND user_id::text = :user_id",
        {"endpoint_id": endpoint_id, "user_id": user_id},
    )

    if existing_uptime:
        old_total = existing_uptime["total_checks"] or 0
        old_failed = existing_uptime["failed_checks"] or 0
        old_avg = existing_uptime["avg_response_ms"] or 0

        new_total = old_total + 1
        new_failed = old_failed + (0 if status == "healthy" else 1)
        new_uptime_pct = ((new_total - new_failed) / new_total) * 100
        new_avg = ((old_avg * old_total) + response_time_ms) / new_total

        await execute_mutate(
            """
            UPDATE integration_uptime
            SET
                total_checks = :total_checks,
                failed_checks = :failed_checks,
                uptime_pct = :uptime_pct,
                avg_response_ms = :avg_response_ms,
                last_status = :last_status,
                updated_at = :updated_at
            WHERE endpoint_id::text = :endpoint_id AND user_id::text = :user_id
            """,
            {
                "total_checks": new_total,
                "failed_checks": new_failed,
                "uptime_pct": round(new_uptime_pct, 2),
                "avg_response_ms": int(new_avg),
                "last_status": status,
                "updated_at": now,
                "endpoint_id": endpoint_id,
                "user_id": user_id,
            },
        )
    else:
        uptime_id = str(uuid.uuid4())
        failed = 0 if status == "healthy" else 1
        await execute_mutate(
            """
            INSERT INTO integration_uptime
                (id, user_id, endpoint_id, uptime_pct, total_checks, failed_checks, avg_response_ms, last_status, updated_at)
            VALUES
                (:id, :user_id, :endpoint_id, :uptime_pct, :total_checks, :failed_checks, :avg_response_ms, :last_status, :updated_at)
            """,
            {
                "id": uptime_id,
                "user_id": user_id,
                "endpoint_id": endpoint_id,
                "uptime_pct": 0.0 if failed else 100.0,
                "total_checks": 1,
                "failed_checks": failed,
                "avg_response_ms": response_time_ms,
                "last_status": status,
                "updated_at": now,
            },
        )

    return {
        "id": check_id,
        "endpoint_id": endpoint_id,
        "status": status,
        "response_time_ms": response_time_ms,
        "status_code": endpoint["expected_status_code"] if status != "timeout" else None,
        "error_message": error_message,
        "checked_at": now,
    }


# ============================================================================
# Endpoint — History
# ============================================================================

@router.get("/integrations/endpoints/{endpoint_id}/history", summary="Get Endpoint Check History", operation_id="get_endpoint_check_history")
async def get_endpoint_history(
    endpoint_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> list[dict[str, Any]]:
    endpoint = await execute_one(
        "SELECT id FROM integration_endpoints WHERE id = :id AND user_id::text = :user_id",
        {"id": endpoint_id, "user_id": user_id},
    )
    if not endpoint:
        raise _endpoint_not_found()

    rows = await execute(
        """
        SELECT * FROM integration_health_checks
        WHERE endpoint_id::text = :endpoint_id AND user_id::text = :user_id
        ORDER BY checked_at DESC
        LIMIT :limit
        """,
        {"endpoint_id": endpoint_id, "user_id": user_id, "limit": limit},
    )
    return serialize_rows(rows)
