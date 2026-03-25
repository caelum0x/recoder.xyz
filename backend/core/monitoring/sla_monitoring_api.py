"""
SLA Monitoring API endpoints.

Provides SLA definition CRUD, measurement recording with simulated metrics,
and a compliance dashboard for tracking service level agreements.
"""

import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/sla", tags=["sla-monitoring"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSlaRequest(BaseModel):
    name: str
    agent_id: Optional[str] = None
    metric_type: str = Field(..., description="response_time, uptime, error_rate, throughput, resolution_time")
    target_value: float
    target_unit: Optional[str] = "ms"
    evaluation_window: Optional[str] = "daily"


class UpdateSlaRequest(BaseModel):
    name: Optional[str] = None
    agent_id: Optional[str] = None
    metric_type: Optional[str] = None
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    evaluation_window: Optional[str] = None
    is_active: Optional[bool] = None


class SlaDefinitionResponse(BaseModel):
    id: str
    user_id: str
    name: str
    agent_id: Optional[str] = None
    metric_type: str
    target_value: float
    target_unit: str
    evaluation_window: str
    is_active: bool
    created_at: str
    compliance_rate: Optional[float] = None
    total_measurements: int = 0
    breach_count: int = 0


class SlaMeasurementResponse(BaseModel):
    id: str
    sla_id: str
    user_id: str
    measured_value: float
    is_breach: bool
    period_start: str
    period_end: str
    measured_at: str


class SlaDashboardResponse(BaseModel):
    overall_compliance_pct: float = 100.0
    total_slas: int = 0
    active_slas: int = 0
    total_measurements: int = 0
    total_breaches: int = 0
    per_sla_compliance: List[dict] = []
    recent_breaches: List[dict] = []
    worst_performing: Optional[dict] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/definitions",
    summary="Create SLA Definition",
    operation_id="create_sla_definition",
)
async def create_sla_definition(
    body: CreateSlaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new SLA definition."""
    try:
        valid_metric_types = ['response_time', 'uptime', 'error_rate', 'throughput', 'resolution_time']
        if body.metric_type not in valid_metric_types:
            raise HTTPException(status_code=400, detail=f"Invalid metric_type. Must be one of: {valid_metric_types}")

        valid_units = ['ms', 'percent', 'count', 'seconds', 'minutes']
        if body.target_unit and body.target_unit not in valid_units:
            raise HTTPException(status_code=400, detail=f"Invalid target_unit. Must be one of: {valid_units}")

        valid_windows = ['hourly', 'daily', 'weekly', 'monthly']
        if body.evaluation_window and body.evaluation_window not in valid_windows:
            raise HTTPException(status_code=400, detail=f"Invalid evaluation_window. Must be one of: {valid_windows}")

        rows = await execute_mutate(
            """
            INSERT INTO sla_definitions (user_id, name, agent_id, metric_type, target_value, target_unit, evaluation_window)
            VALUES (:user_id, :name, :agent_id, :metric_type, :target_value, :target_unit, :evaluation_window)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name,
                "agent_id": body.agent_id,
                "metric_type": body.metric_type,
                "target_value": body.target_value,
                "target_unit": body.target_unit or "ms",
                "evaluation_window": body.evaluation_window or "daily",
            },
        )

        if rows:
            return serialize_rows(rows)[0]
        raise HTTPException(status_code=500, detail="Failed to create SLA definition")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SLA definition: {e}")
        raise HTTPException(status_code=500, detail="Failed to create SLA definition")


@router.get(
    "/definitions",
    summary="List SLA Definitions",
    operation_id="list_sla_definitions",
)
async def list_sla_definitions(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all SLA definitions with compliance rates."""
    try:
        rows = await execute(
            """
            SELECT
                sd.*,
                COALESCE(m.total_measurements, 0) AS total_measurements,
                COALESCE(m.breach_count, 0) AS breach_count,
                CASE
                    WHEN COALESCE(m.total_measurements, 0) = 0 THEN NULL
                    ELSE ROUND(
                        ((COALESCE(m.total_measurements, 0) - COALESCE(m.breach_count, 0))::NUMERIC
                         / COALESCE(m.total_measurements, 1)) * 100, 2
                    )
                END AS compliance_rate
            FROM sla_definitions sd
            LEFT JOIN (
                SELECT
                    sla_id,
                    COUNT(*) AS total_measurements,
                    COUNT(*) FILTER (WHERE is_breach = true) AS breach_count
                FROM sla_measurements
                WHERE user_id::text = :user_id
                GROUP BY sla_id
            ) m ON m.sla_id::text = sd.id::text
            WHERE sd.user_id::text = :user_id
            ORDER BY sd.created_at DESC
            """,
            {"user_id": user_id},
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error listing SLA definitions: {e}")
        raise HTTPException(status_code=500, detail="Failed to list SLA definitions")


@router.patch(
    "/definitions/{sla_id}",
    summary="Update SLA Definition",
    operation_id="update_sla_definition",
)
async def update_sla_definition(
    sla_id: str,
    body: UpdateSlaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing SLA definition."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id FROM sla_definitions WHERE id = :sla_id AND user_id::text = :user_id",
            {"sla_id": sla_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="SLA definition not found")

        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.agent_id is not None:
            updates["agent_id"] = body.agent_id
        if body.metric_type is not None:
            updates["metric_type"] = body.metric_type
        if body.target_value is not None:
            updates["target_value"] = body.target_value
        if body.target_unit is not None:
            updates["target_unit"] = body.target_unit
        if body.evaluation_window is not None:
            updates["evaluation_window"] = body.evaluation_window
        if body.is_active is not None:
            updates["is_active"] = body.is_active

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["sla_id"] = sla_id
        updates["user_id"] = user_id

        rows = await execute_mutate(
            f"""
            UPDATE sla_definitions
            SET {set_clause}
            WHERE id = :sla_id AND user_id::text = :user_id
            RETURNING *
            """,
            updates,
        )

        if rows:
            return serialize_rows(rows)[0]
        raise HTTPException(status_code=404, detail="SLA definition not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating SLA definition {sla_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update SLA definition")


@router.delete(
    "/definitions/{sla_id}",
    summary="Delete SLA Definition",
    operation_id="delete_sla_definition",
)
async def delete_sla_definition(
    sla_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an SLA definition and its measurements."""
    try:
        rows = await execute_mutate(
            "DELETE FROM sla_definitions WHERE id = :sla_id AND user_id::text = :user_id RETURNING id",
            {"sla_id": sla_id, "user_id": user_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="SLA definition not found")

        return {"success": True, "deleted_id": sla_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting SLA definition {sla_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete SLA definition")


@router.post(
    "/measure",
    summary="Record SLA Measurements",
    operation_id="measure_sla",
)
async def measure_sla(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Record measurements for all active SLAs.
    Simulates measurements based on metric type and detects breaches.
    """
    try:
        slas = await execute(
            "SELECT * FROM sla_definitions WHERE user_id::text = :user_id AND is_active = true",
            {"user_id": user_id},
        )

        if not slas:
            return {"success": True, "measured": 0, "breaches": 0}

        now = datetime.now(timezone.utc)
        measurements = []
        breach_count = 0

        for sla in slas:
            # Simulate measurement based on metric type
            metric_type = sla["metric_type"]
            target_value = float(sla["target_value"])

            if metric_type == "response_time":
                measured = round(random.uniform(50, 500), 4)
                # Breach if measured > target (response time should be below target)
                is_breach = measured > target_value
            elif metric_type == "uptime":
                measured = round(random.uniform(95.0, 100.0), 4)
                # Breach if measured < target (uptime should be above target)
                is_breach = measured < target_value
            elif metric_type == "error_rate":
                measured = round(random.uniform(0, 10.0), 4)
                # Breach if measured > target (error rate should be below target)
                is_breach = measured > target_value
            elif metric_type == "throughput":
                measured = round(random.uniform(10, 100), 4)
                # Breach if measured < target (throughput should be above target)
                is_breach = measured < target_value
            elif metric_type == "resolution_time":
                measured = round(random.uniform(30, 600), 4)
                # Breach if measured > target (resolution time should be below target)
                is_breach = measured > target_value
            else:
                continue

            # Determine period based on evaluation window
            window = sla["evaluation_window"]
            if window == "hourly":
                period_start = now.replace(minute=0, second=0, microsecond=0)
                period_end = period_start + timedelta(hours=1)
            elif window == "daily":
                period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                period_end = period_start + timedelta(days=1)
            elif window == "weekly":
                start_of_week = now - timedelta(days=now.weekday())
                period_start = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
                period_end = period_start + timedelta(weeks=1)
            else:  # monthly
                period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                if now.month == 12:
                    period_end = period_start.replace(year=now.year + 1, month=1)
                else:
                    period_end = period_start.replace(month=now.month + 1)

            if is_breach:
                breach_count += 1

            await execute_mutate(
                """
                INSERT INTO sla_measurements (sla_id, user_id, measured_value, is_breach, period_start, period_end)
                VALUES (:sla_id, :user_id, :measured_value, :is_breach, :period_start, :period_end)
                """,
                {
                    "sla_id": str(sla["id"]),
                    "user_id": user_id,
                    "measured_value": measured,
                    "is_breach": is_breach,
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                },
            )

            measurements.append({
                "sla_id": str(sla["id"]),
                "sla_name": sla["name"],
                "metric_type": metric_type,
                "measured_value": measured,
                "target_value": target_value,
                "is_breach": is_breach,
            })

        return {
            "success": True,
            "measured": len(measurements),
            "breaches": breach_count,
            "measurements": measurements,
        }

    except Exception as e:
        logger.error(f"Error measuring SLAs: {e}")
        raise HTTPException(status_code=500, detail="Failed to measure SLAs")


@router.get(
    "/{sla_id}/measurements",
    summary="List SLA Measurements",
    operation_id="list_sla_measurements",
)
async def list_sla_measurements(
    sla_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    breach_only: bool = Query(False, description="Filter to breaches only"),
    limit: int = Query(50, ge=1, le=500),
):
    """List measurements for a specific SLA."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id FROM sla_definitions WHERE id = :sla_id AND user_id::text = :user_id",
            {"sla_id": sla_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="SLA definition not found")

        breach_filter = "AND sm.is_breach = true" if breach_only else ""

        rows = await execute(
            f"""
            SELECT sm.*
            FROM sla_measurements sm
            WHERE sm.sla_id::text = :sla_id AND sm.user_id::text = :user_id
            {breach_filter}
            ORDER BY sm.measured_at DESC
            LIMIT :limit
            """,
            {"sla_id": sla_id, "user_id": user_id, "limit": limit},
        )

        return serialize_rows(rows)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing measurements for SLA {sla_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list SLA measurements")


@router.get(
    "/dashboard",
    summary="SLA Dashboard",
    operation_id="sla_dashboard",
)
async def sla_dashboard(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Dashboard view: overall compliance %, per-SLA compliance,
    recent breaches, and worst performing SLA.
    """
    try:
        # Overall stats
        overall = await execute_one(
            """
            SELECT
                COUNT(*) AS total_measurements,
                COUNT(*) FILTER (WHERE is_breach = true) AS total_breaches
            FROM sla_measurements
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        total_measurements = int(overall["total_measurements"]) if overall else 0
        total_breaches = int(overall["total_breaches"]) if overall else 0
        overall_compliance = round(
            ((total_measurements - total_breaches) / total_measurements) * 100, 2
        ) if total_measurements > 0 else 100.0

        # SLA counts
        sla_counts = await execute_one(
            """
            SELECT
                COUNT(*) AS total_slas,
                COUNT(*) FILTER (WHERE is_active = true) AS active_slas
            FROM sla_definitions
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        # Per-SLA compliance
        per_sla = await execute(
            """
            SELECT
                sd.id,
                sd.name,
                sd.metric_type,
                sd.target_value,
                sd.target_unit,
                sd.agent_id,
                COALESCE(m.total, 0) AS total_measurements,
                COALESCE(m.breaches, 0) AS breach_count,
                CASE
                    WHEN COALESCE(m.total, 0) = 0 THEN NULL
                    ELSE ROUND(
                        ((COALESCE(m.total, 0) - COALESCE(m.breaches, 0))::NUMERIC
                         / COALESCE(m.total, 1)) * 100, 2
                    )
                END AS compliance_rate
            FROM sla_definitions sd
            LEFT JOIN (
                SELECT sla_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_breach = true) AS breaches
                FROM sla_measurements
                WHERE user_id::text = :user_id
                GROUP BY sla_id
            ) m ON m.sla_id::text = sd.id::text
            WHERE sd.user_id::text = :user_id AND sd.is_active = true
            ORDER BY compliance_rate ASC NULLS LAST
            """,
            {"user_id": user_id},
        )

        # Recent breaches
        recent_breaches = await execute(
            """
            SELECT
                sm.id,
                sm.sla_id,
                sd.name AS sla_name,
                sd.metric_type,
                sm.measured_value,
                sd.target_value,
                sd.target_unit,
                sm.measured_at
            FROM sla_measurements sm
            JOIN sla_definitions sd ON sd.id::text = sm.sla_id::text
            WHERE sm.user_id::text = :user_id AND sm.is_breach = true
            ORDER BY sm.measured_at DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Worst performing SLA
        worst = None
        per_sla_serialized = serialize_rows(per_sla)
        for s in per_sla_serialized:
            if s.get("compliance_rate") is not None:
                if worst is None or (s["compliance_rate"] < worst["compliance_rate"]):
                    worst = s

        return {
            "overall_compliance_pct": overall_compliance,
            "total_slas": int(sla_counts["total_slas"]) if sla_counts else 0,
            "active_slas": int(sla_counts["active_slas"]) if sla_counts else 0,
            "total_measurements": total_measurements,
            "total_breaches": total_breaches,
            "per_sla_compliance": per_sla_serialized,
            "recent_breaches": serialize_rows(recent_breaches),
            "worst_performing": worst,
        }

    except Exception as e:
        logger.error(f"Error fetching SLA dashboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch SLA dashboard")
