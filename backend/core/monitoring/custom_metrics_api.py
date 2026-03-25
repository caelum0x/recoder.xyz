"""
Custom Metrics API endpoints.

Provides CRUD for user-defined metric definitions and time-series value recording,
aggregation, and dashboard views.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/custom-metrics", tags=["custom-metrics"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateMetricDefRequest(BaseModel):
    metric_name: str = Field(..., min_length=1, max_length=100, description="Slug identifier (unique per user)")
    display_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    unit: str = Field(default="count", max_length=50)
    aggregation: str = Field(default="sum", description="sum | avg | min | max | count | last")
    chart_type: str = Field(default="line", description="line | bar | area | gauge | number")
    color: str = Field(default="#6366f1", max_length=20)


class UpdateMetricDefRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    aggregation: Optional[str] = None
    chart_type: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class RecordValueRequest(BaseModel):
    value: float
    dimensions: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Helpers
# ============================================================================

VALID_AGGREGATIONS = {"sum", "avg", "min", "max", "count", "last"}
VALID_CHART_TYPES = {"line", "bar", "area", "gauge", "number"}


def _validate_def_fields(aggregation: Optional[str], chart_type: Optional[str]):
    if aggregation and aggregation not in VALID_AGGREGATIONS:
        raise HTTPException(
            status_code=400,
            detail=f"aggregation must be one of: {', '.join(VALID_AGGREGATIONS)}",
        )
    if chart_type and chart_type not in VALID_CHART_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"chart_type must be one of: {', '.join(VALID_CHART_TYPES)}",
        )


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/definitions",
    summary="Create metric definition",
    operation_id="create_metric_definition",
)
async def create_metric_definition(
    body: CreateMetricDefRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new custom metric definition."""
    _validate_def_fields(body.aggregation, body.chart_type)
    try:
        row = await execute_one(
            """
            INSERT INTO custom_metric_definitions (
                id, user_id, metric_name, display_name, description,
                unit, aggregation, chart_type, color, is_active, created_at
            ) VALUES (
                :id, :user_id, :metric_name, :display_name, :description,
                :unit, :aggregation, :chart_type, :color, true, now()
            )
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "metric_name": body.metric_name,
                "display_name": body.display_name,
                "description": body.description,
                "unit": body.unit,
                "aggregation": body.aggregation,
                "chart_type": body.chart_type,
                "color": body.color,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Metric '{body.metric_name}' already exists")
        logger.error(f"Error creating metric definition: {e}")
        raise HTTPException(status_code=500, detail="Failed to create metric definition")


@router.get(
    "/definitions",
    summary="List metric definitions",
    operation_id="list_metric_definitions",
)
async def list_metric_definitions(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all custom metric definitions for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM custom_metric_definitions
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing metric definitions: {e}")
        raise HTTPException(status_code=500, detail="Failed to list metric definitions")


@router.patch(
    "/definitions/{metric_id}",
    summary="Update metric definition",
    operation_id="update_metric_definition",
)
async def update_metric_definition(
    metric_id: str,
    body: UpdateMetricDefRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a custom metric definition."""
    existing = await execute_one(
        "SELECT id FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id",
        {"id": metric_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Metric definition not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    _validate_def_fields(updates.get("aggregation"), updates.get("chart_type"))

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "id": metric_id, "user_id": user_id}

    try:
        row = await execute_one(
            f"""
            UPDATE custom_metric_definitions
            SET {set_clauses}
            WHERE id = :id AND user_id::text = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error updating metric definition {metric_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update metric definition")


@router.delete(
    "/definitions/{metric_id}",
    summary="Delete metric definition",
    operation_id="delete_metric_definition",
)
async def delete_metric_definition(
    metric_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a custom metric definition and all its values (CASCADE)."""
    existing = await execute_one(
        "SELECT id FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id",
        {"id": metric_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Metric definition not found")

    try:
        await execute_mutate(
            "DELETE FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id",
            {"id": metric_id, "user_id": user_id},
        )
        return {"success": True, "deleted_id": metric_id}
    except Exception as e:
        logger.error(f"Error deleting metric definition {metric_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete metric definition")


@router.post(
    "/{metric_id}/record",
    summary="Record metric value",
    operation_id="record_metric_value",
)
async def record_metric_value(
    metric_id: str,
    body: RecordValueRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a new value for a custom metric."""
    definition = await execute_one(
        "SELECT id FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id AND is_active = true",
        {"id": metric_id, "user_id": user_id},
    )
    if not definition:
        raise HTTPException(status_code=404, detail="Metric definition not found or inactive")

    try:
        row = await execute_one(
            """
            INSERT INTO custom_metric_values (
                id, metric_id, user_id, value, dimensions, recorded_at
            ) VALUES (
                :id, :metric_id, :user_id, :value, :dimensions, now()
            )
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "metric_id": metric_id,
                "user_id": user_id,
                "value": body.value,
                "dimensions": body.dimensions,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error recording metric value for {metric_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record metric value")


@router.get(
    "/{metric_id}/values",
    summary="List metric values",
    operation_id="list_metric_values",
)
async def list_metric_values(
    metric_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(200, ge=1, le=2000),
):
    """List recorded values for a metric within the given time window."""
    definition = await execute_one(
        "SELECT id FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id",
        {"id": metric_id, "user_id": user_id},
    )
    if not definition:
        raise HTTPException(status_code=404, detail="Metric definition not found")

    try:
        rows = await execute(
            """
            SELECT * FROM custom_metric_values
            WHERE metric_id::text = :metric_id
              AND user_id::text = :user_id
              AND recorded_at >= now() - :hours * INTERVAL '1 hour'
            ORDER BY recorded_at DESC
            LIMIT :limit
            """,
            {"metric_id": metric_id, "user_id": user_id, "hours": hours, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing metric values for {metric_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list metric values")


@router.get(
    "/{metric_id}/aggregate",
    summary="Get metric aggregate stats",
    operation_id="get_metric_aggregate",
)
async def get_metric_aggregate(
    metric_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    hours: int = Query(24, ge=1, le=720),
):
    """Return aggregate statistics (latest, min, max, avg, sum, trend) for a metric."""
    definition = await execute_one(
        "SELECT * FROM custom_metric_definitions WHERE id = :id AND user_id::text = :user_id",
        {"id": metric_id, "user_id": user_id},
    )
    if not definition:
        raise HTTPException(status_code=404, detail="Metric definition not found")

    try:
        stats = await execute_one(
            """
            SELECT
                COUNT(*) AS count,
                MIN(value) AS min_value,
                MAX(value) AS max_value,
                AVG(value) AS avg_value,
                SUM(value) AS sum_value,
                (SELECT value FROM custom_metric_values
                 WHERE metric_id::text = :metric_id AND user_id::text = :user_id
                 ORDER BY recorded_at DESC LIMIT 1) AS latest_value
            FROM custom_metric_values
            WHERE metric_id::text = :metric_id
              AND user_id::text = :user_id
              AND recorded_at >= now() - :hours * INTERVAL '1 hour'
            """,
            {"metric_id": metric_id, "user_id": user_id, "hours": hours},
        )

        # Simple trend: compare first half vs second half average
        trend = "flat"
        count = int(stats["count"] or 0)
        if count >= 4:
            half = hours // 2
            first_half = await execute_one(
                """
                SELECT AVG(value) AS avg_val FROM custom_metric_values
                WHERE metric_id::text = :metric_id AND user_id::text = :user_id
                  AND recorded_at >= now() - :hours * INTERVAL '1 hour'
                  AND recorded_at < now() - :half * INTERVAL '1 hour'
                """,
                {"metric_id": metric_id, "user_id": user_id, "hours": hours, "half": half},
            )
            second_half = await execute_one(
                """
                SELECT AVG(value) AS avg_val FROM custom_metric_values
                WHERE metric_id::text = :metric_id AND user_id::text = :user_id
                  AND recorded_at >= now() - :half * INTERVAL '1 hour'
                """,
                {"metric_id": metric_id, "user_id": user_id, "half": half},
            )
            first_avg = float(first_half["avg_val"] or 0)
            second_avg = float(second_half["avg_val"] or 0)
            if second_avg > first_avg * 1.05:
                trend = "up"
            elif second_avg < first_avg * 0.95:
                trend = "down"

        return {
            "metric_id": metric_id,
            "metric_name": definition["metric_name"],
            "display_name": definition["display_name"],
            "unit": definition["unit"],
            "count": count,
            "latest": float(stats["latest_value"]) if stats["latest_value"] is not None else None,
            "min": float(stats["min_value"]) if stats["min_value"] is not None else None,
            "max": float(stats["max_value"]) if stats["max_value"] is not None else None,
            "avg": round(float(stats["avg_value"]), 4) if stats["avg_value"] is not None else None,
            "sum": float(stats["sum_value"]) if stats["sum_value"] is not None else None,
            "trend": trend,
        }
    except Exception as e:
        logger.error(f"Error aggregating metric {metric_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to aggregate metric")


@router.get(
    "/dashboard",
    summary="Get all metrics with latest values",
    operation_id="get_metrics_dashboard",
)
async def get_metrics_dashboard(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return all active metric definitions with their latest recorded values."""
    try:
        rows = await execute(
            """
            SELECT
                d.id,
                d.metric_name,
                d.display_name,
                d.description,
                d.unit,
                d.aggregation,
                d.chart_type,
                d.color,
                d.is_active,
                d.created_at,
                (
                    SELECT v.value
                    FROM custom_metric_values v
                    WHERE v.metric_id::text = d.id::text AND v.user_id::text = d.user_id::text
                    ORDER BY v.recorded_at DESC
                    LIMIT 1
                ) AS latest_value,
                (
                    SELECT v.recorded_at
                    FROM custom_metric_values v
                    WHERE v.metric_id::text = d.id::text AND v.user_id::text = d.user_id::text
                    ORDER BY v.recorded_at DESC
                    LIMIT 1
                ) AS latest_recorded_at,
                (
                    SELECT COUNT(*)
                    FROM custom_metric_values v
                    WHERE v.metric_id::text = d.id::text
                      AND v.user_id::text = d.user_id::text
                      AND v.recorded_at >= now() - INTERVAL '24 hours'
                ) AS values_last_24h
            FROM custom_metric_definitions d
            WHERE d.user_id::text = :user_id
            ORDER BY d.created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error fetching metrics dashboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch metrics dashboard")
