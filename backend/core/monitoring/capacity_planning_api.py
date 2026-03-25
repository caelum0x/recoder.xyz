"""
Capacity Planning API endpoints.

Provides capacity metric recording, capacity plans CRUD, and alert rule
management with usage-percentage computation.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_mutate, execute_one, serialize_row, serialize_rows
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["capacity-planning"])


# ============================================================================
# Pydantic Models
# ============================================================================


class RecordMetricRequest(BaseModel):
    metric_name: str = Field(..., min_length=1, max_length=200)
    current_value: float
    max_capacity: Optional[float] = None
    unit: Optional[str] = "count"


class CreatePlanRequest(BaseModel):
    plan_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    target_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    metric_projections: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    growth_assumptions: Optional[Dict[str, Any]] = Field(default_factory=dict)
    recommendations: Optional[List[str]] = Field(default_factory=list)


class UpdatePlanRequest(BaseModel):
    plan_name: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[str] = None
    metric_projections: Optional[List[Dict[str, Any]]] = None
    growth_assumptions: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[str]] = None
    status: Optional[str] = None


class SetAlertRequest(BaseModel):
    metric_name: str = Field(..., min_length=1, max_length=200)
    threshold_pct: Optional[int] = 80
    is_active: Optional[bool] = True


# ============================================================================
# Helpers
# ============================================================================

VALID_STATUSES = {"draft", "active", "completed", "archived"}


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj if obj is not None else [])


def _json_dumps_obj(obj: Any) -> str:
    return json.dumps(obj if obj is not None else {})


def _array_literal(items: Optional[List[str]]) -> str:
    if not items:
        return "{}"
    escaped = [i.replace('"', '\\"') for i in items]
    return "{" + ",".join(f'"{e}"' for e in escaped) + "}"


# ============================================================================
# Capacity Metrics
# ============================================================================


@router.post(
    "/capacity/metrics",
    summary="Record capacity metric",
    operation_id="record_capacity_metric",
)
async def record_capacity_metric(
    body: RecordMetricRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a capacity metric data point."""
    try:
        row = await execute_one(
            """
            INSERT INTO capacity_metrics
              (id, user_id, metric_name, current_value, max_capacity, unit, recorded_at)
            VALUES
              (:id, :user_id, :metric_name, :current_value, :max_capacity, :unit, now())
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "metric_name": body.metric_name,
                "current_value": body.current_value,
                "max_capacity": body.max_capacity,
                "unit": body.unit or "count",
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"record_capacity_metric error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record capacity metric")


@router.get(
    "/capacity/metrics",
    summary="List current capacity metrics",
    operation_id="list_current_capacity_metrics",
)
async def list_current_capacity_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return the latest data point per distinct metric_name for the user."""
    try:
        rows = await execute(
            """
            SELECT DISTINCT ON (metric_name)
              id, user_id, metric_name, current_value, max_capacity, unit, recorded_at
            FROM capacity_metrics
            WHERE user_id::text = :user_id
            ORDER BY metric_name, recorded_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_current_capacity_metrics error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list capacity metrics")


@router.get(
    "/capacity/metrics/{metric_name}/history",
    summary="Get capacity metric history",
    operation_id="get_capacity_metric_history",
)
async def get_capacity_metric_history(
    metric_name: str,
    days: int = Query(default=30, ge=1, le=365),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return historical data points for a specific metric."""
    try:
        rows = await execute(
            """
            SELECT * FROM capacity_metrics
            WHERE user_id::text = :user_id
              AND metric_name = :metric_name
              AND recorded_at >= now() - :days * INTERVAL '1 day'
            ORDER BY recorded_at DESC
            """,
            {"user_id": user_id, "metric_name": metric_name, "days": days},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"get_capacity_metric_history error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get metric history")


# ============================================================================
# Capacity Plans
# ============================================================================


@router.post(
    "/capacity/plans",
    summary="Create capacity plan",
    operation_id="create_capacity_plan",
)
async def create_capacity_plan(
    body: CreatePlanRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new capacity plan."""
    try:
        row = await execute_one(
            """
            INSERT INTO capacity_plans
              (id, user_id, plan_name, description, target_date,
               metric_projections, growth_assumptions, recommendations,
               status, created_at, updated_at)
            VALUES
              (:id, :user_id, :plan_name, :description, :target_date,
               :metric_projections::jsonb, :growth_assumptions::jsonb,
               :recommendations, 'draft', now(), now())
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "plan_name": body.plan_name,
                "description": body.description,
                "target_date": body.target_date,
                "metric_projections": _json_dumps(body.metric_projections),
                "growth_assumptions": _json_dumps_obj(body.growth_assumptions),
                "recommendations": _array_literal(body.recommendations),
            },
        )
        return serialize_row(row)
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Plan '{body.plan_name}' already exists",
            )
        logger.error(f"create_capacity_plan error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create capacity plan")


@router.get(
    "/capacity/plans",
    summary="List capacity plans",
    operation_id="list_capacity_plans",
)
async def list_capacity_plans(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all capacity plans for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM capacity_plans
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_capacity_plans error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list capacity plans")


@router.get(
    "/capacity/plans/{plan_id}",
    summary="Get capacity plan detail",
    operation_id="get_capacity_plan",
)
async def get_capacity_plan(
    plan_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single capacity plan."""
    row = await execute_one(
        "SELECT * FROM capacity_plans WHERE id = :id AND user_id::text = :user_id",
        {"id": plan_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Capacity plan not found")
    return serialize_row(row)


@router.patch(
    "/capacity/plans/{plan_id}",
    summary="Update capacity plan",
    operation_id="update_capacity_plan",
)
async def update_capacity_plan(
    plan_id: str,
    body: UpdatePlanRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a capacity plan."""
    existing = await execute_one(
        "SELECT id FROM capacity_plans WHERE id = :id AND user_id::text = :user_id",
        {"id": plan_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Capacity plan not found")

    raw = body.model_dump(exclude_none=True)
    if not raw:
        row = await execute_one(
            "SELECT * FROM capacity_plans WHERE id = :id", {"id": plan_id}
        )
        return serialize_row(row)

    if "status" in raw and raw["status"] not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of: {', '.join(VALID_STATUSES)}",
        )

    # Build dynamic SET clause
    set_parts: List[str] = []
    params: Dict[str, Any] = {"id": plan_id, "user_id": user_id}

    for k, v in raw.items():
        if k == "metric_projections":
            set_parts.append(f"{k} = :{k}::jsonb")
            params[k] = _json_dumps(v)
        elif k == "growth_assumptions":
            set_parts.append(f"{k} = :{k}::jsonb")
            params[k] = _json_dumps_obj(v)
        elif k == "recommendations":
            set_parts.append(f"{k} = :{k}")
            params[k] = _array_literal(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    try:
        row = await execute_one(
            f"UPDATE capacity_plans SET {set_clause} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"update_capacity_plan error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update capacity plan")


@router.delete(
    "/capacity/plans/{plan_id}",
    summary="Delete capacity plan",
    operation_id="delete_capacity_plan",
)
async def delete_capacity_plan(
    plan_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a capacity plan."""
    existing = await execute_one(
        "SELECT id FROM capacity_plans WHERE id = :id AND user_id::text = :user_id",
        {"id": plan_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Capacity plan not found")

    await execute_mutate(
        "DELETE FROM capacity_plans WHERE id = :id AND user_id::text = :user_id",
        {"id": plan_id, "user_id": user_id},
    )
    return {"deleted": True, "id": plan_id}


# ============================================================================
# Capacity Alerts
# ============================================================================


@router.post(
    "/capacity/alerts",
    summary="Create or update capacity alert",
    operation_id="set_capacity_alert",
)
async def set_capacity_alert(
    body: SetAlertRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or update a capacity alert rule for a metric."""
    try:
        row = await execute_one(
            """
            INSERT INTO capacity_alerts
              (id, user_id, metric_name, threshold_pct, is_active, created_at)
            VALUES
              (:id, :user_id, :metric_name, :threshold_pct, :is_active, now())
            ON CONFLICT (user_id, metric_name) DO UPDATE
              SET threshold_pct = EXCLUDED.threshold_pct,
                  is_active = EXCLUDED.is_active
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "metric_name": body.metric_name,
                "threshold_pct": body.threshold_pct if body.threshold_pct is not None else 80,
                "is_active": body.is_active if body.is_active is not None else True,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"set_capacity_alert error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to set capacity alert")


@router.get(
    "/capacity/alerts",
    summary="List capacity alerts",
    operation_id="list_capacity_alerts",
)
async def list_capacity_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all capacity alerts with current usage percentage."""
    try:
        alerts = await execute(
            "SELECT * FROM capacity_alerts WHERE user_id::text = :user_id ORDER BY created_at DESC",
            {"user_id": user_id},
        )
        if not alerts:
            return []

        result = []
        for alert in alerts:
            alert_dict = dict(alert)
            # Fetch latest metric value
            metric_row = await execute_one(
                """
                SELECT current_value, max_capacity
                FROM capacity_metrics
                WHERE user_id::text = :user_id AND metric_name = :metric_name
                ORDER BY recorded_at DESC
                LIMIT 1
                """,
                {"user_id": user_id, "metric_name": alert_dict["metric_name"]},
            )
            if metric_row and metric_row["max_capacity"]:
                cv = float(metric_row["current_value"])
                mc = float(metric_row["max_capacity"])
                alert_dict["usage_pct"] = round((cv / mc * 100), 2) if mc > 0 else None
                alert_dict["current_value"] = cv
            else:
                alert_dict["usage_pct"] = None
                alert_dict["current_value"] = float(metric_row["current_value"]) if metric_row else None
            result.append(alert_dict)

        return result
    except Exception as exc:
        logger.error(f"list_capacity_alerts error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list capacity alerts")


@router.post(
    "/capacity/check",
    summary="Check capacity alerts",
    operation_id="check_capacity_alerts",
)
async def check_capacity_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Check all active alerts and update last_triggered_at for those that fire."""
    try:
        alerts = await execute(
            "SELECT * FROM capacity_alerts WHERE user_id::text = :user_id AND is_active = true",
            {"user_id": user_id},
        )
        if not alerts:
            return {"triggered": []}

        triggered = []
        for alert in alerts:
            alert_dict = dict(alert)
            metric_row = await execute_one(
                """
                SELECT current_value, max_capacity
                FROM capacity_metrics
                WHERE user_id::text = :user_id AND metric_name = :metric_name
                ORDER BY recorded_at DESC
                LIMIT 1
                """,
                {"user_id": user_id, "metric_name": alert_dict["metric_name"]},
            )
            if not metric_row or not metric_row["max_capacity"]:
                continue

            cv = float(metric_row["current_value"])
            mc = float(metric_row["max_capacity"])
            usage_pct = round((cv / mc * 100), 2) if mc > 0 else 0.0

            if usage_pct >= alert_dict["threshold_pct"]:
                await execute_mutate(
                    """
                    UPDATE capacity_alerts
                    SET last_triggered_at = now()
                    WHERE id = :id AND user_id::text = :user_id
                    """,
                    {"id": str(alert_dict["id"]), "user_id": user_id},
                )
                triggered.append(
                    {
                        "metric_name": alert_dict["metric_name"],
                        "usage_pct": usage_pct,
                        "threshold_pct": alert_dict["threshold_pct"],
                    }
                )

        return {"triggered": triggered}
    except Exception as exc:
        logger.error(f"check_capacity_alerts error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to check capacity alerts")
