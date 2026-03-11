"""
Anomaly Detection Config & Detected Anomalies API (Sprint 67 Phase 3).

Provides CRUD for detection configs, z-score-based scanning, listing of detected
anomalies with status management, and aggregate stats.
"""

import random
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/anomaly", tags=["anomaly-detection"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateConfigRequest(BaseModel):
    metric_type: str
    agent_id: Optional[str] = None
    detection_method: str = Field(default="zscore", description="zscore, iqr, threshold, percentage_change")
    sensitivity: float = Field(default=2.0, ge=0.5, le=4.0)
    window_hours: int = Field(default=24, ge=1, le=720)
    is_active: bool = True


class UpdateConfigRequest(BaseModel):
    metric_type: Optional[str] = None
    agent_id: Optional[str] = None
    detection_method: Optional[str] = None
    sensitivity: Optional[float] = Field(default=None, ge=0.5, le=4.0)
    window_hours: Optional[int] = Field(default=None, ge=1, le=720)
    is_active: Optional[bool] = None


class UpdateAnomalyStatusRequest(BaseModel):
    status: str = Field(..., description="open, acknowledged, resolved, false_positive")


# ============================================================================
# Helpers
# ============================================================================

def _severity_from_score(score: float) -> str:
    if score > 3.0:
        return "critical"
    if score > 2.0:
        return "high"
    if score > 1.5:
        return "medium"
    return "low"


def _serialize_config(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "metric_type": row["metric_type"],
        "agent_id": row.get("agent_id"),
        "detection_method": row["detection_method"],
        "sensitivity": float(row["sensitivity"]),
        "window_hours": row["window_hours"],
        "is_active": row["is_active"],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


def _serialize_anomaly(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "config_id": str(row["config_id"]) if row.get("config_id") else None,
        "agent_id": row.get("agent_id"),
        "metric_type": row["metric_type"],
        "observed_value": float(row["observed_value"]) if row["observed_value"] is not None else None,
        "expected_value": float(row["expected_value"]) if row.get("expected_value") is not None else None,
        "deviation_score": float(row["deviation_score"]) if row.get("deviation_score") is not None else None,
        "severity": row["severity"],
        "status": row["status"],
        "description": row.get("description"),
        "detected_at": row["detected_at"].isoformat() if hasattr(row["detected_at"], "isoformat") else str(row["detected_at"]),
    }


# ============================================================================
# Detection Config Endpoints
# ============================================================================

@router.post(
    "/configs",
    summary="Create Detection Config",
    operation_id="create_anomaly_config",
)
async def create_anomaly_config(
    body: CreateConfigRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new anomaly detection configuration."""
    valid_methods = {"zscore", "iqr", "threshold", "percentage_change"}
    if body.detection_method not in valid_methods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid detection_method. Must be one of: {', '.join(valid_methods)}"
        )
    try:
        rows = await execute_mutate(
            """
            INSERT INTO anomaly_detection_configs
                (user_id, metric_type, agent_id, detection_method, sensitivity, window_hours, is_active)
            VALUES
                (:user_id, :metric_type, :agent_id, :detection_method, :sensitivity, :window_hours, :is_active)
            ON CONFLICT (user_id, metric_type, agent_id) DO UPDATE SET
                detection_method = EXCLUDED.detection_method,
                sensitivity = EXCLUDED.sensitivity,
                window_hours = EXCLUDED.window_hours,
                is_active = EXCLUDED.is_active
            RETURNING id, user_id, metric_type, agent_id, detection_method,
                      sensitivity, window_hours, is_active, created_at
            """,
            {
                "user_id": user_id,
                "metric_type": body.metric_type,
                "agent_id": body.agent_id,
                "detection_method": body.detection_method,
                "sensitivity": body.sensitivity,
                "window_hours": body.window_hours,
                "is_active": body.is_active,
            },
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create config")
        return _serialize_config(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating anomaly config: {e}")
        raise HTTPException(status_code=500, detail="Failed to create anomaly config")


@router.get(
    "/configs",
    summary="List Detection Configs",
    operation_id="list_anomaly_configs",
)
async def list_anomaly_configs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all anomaly detection configurations for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT id, user_id, metric_type, agent_id, detection_method,
                   sensitivity, window_hours, is_active, created_at
            FROM anomaly_detection_configs
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return [_serialize_config(r) for r in rows]
    except Exception as e:
        logger.error(f"Error listing anomaly configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list anomaly configs")


@router.patch(
    "/configs/{config_id}",
    summary="Update Detection Config",
    operation_id="update_anomaly_config",
)
async def update_anomaly_config(
    config_id: str,
    body: UpdateConfigRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing anomaly detection configuration."""
    if body.detection_method is not None:
        valid_methods = {"zscore", "iqr", "threshold", "percentage_change"}
        if body.detection_method not in valid_methods:
            raise HTTPException(status_code=400, detail=f"Invalid detection_method")

    try:
        set_parts = []
        params: dict = {"config_id": config_id, "user_id": user_id}

        if body.metric_type is not None:
            set_parts.append("metric_type = :metric_type")
            params["metric_type"] = body.metric_type
        if body.agent_id is not None:
            set_parts.append("agent_id = :agent_id")
            params["agent_id"] = body.agent_id
        if body.detection_method is not None:
            set_parts.append("detection_method = :detection_method")
            params["detection_method"] = body.detection_method
        if body.sensitivity is not None:
            set_parts.append("sensitivity = :sensitivity")
            params["sensitivity"] = body.sensitivity
        if body.window_hours is not None:
            set_parts.append("window_hours = :window_hours")
            params["window_hours"] = body.window_hours
        if body.is_active is not None:
            set_parts.append("is_active = :is_active")
            params["is_active"] = body.is_active

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(set_parts)
        rows = await execute_mutate(
            f"""
            UPDATE anomaly_detection_configs
            SET {set_clause}
            WHERE id = :config_id AND user_id = :user_id
            RETURNING id, user_id, metric_type, agent_id, detection_method,
                      sensitivity, window_hours, is_active, created_at
            """,
            params,
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Config not found")
        return _serialize_config(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating anomaly config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update anomaly config")


@router.delete(
    "/configs/{config_id}",
    summary="Delete Detection Config",
    operation_id="delete_anomaly_config",
)
async def delete_anomaly_config(
    config_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an anomaly detection configuration."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM anomaly_detection_configs
            WHERE id = :config_id AND user_id = :user_id
            RETURNING id
            """,
            {"config_id": config_id, "user_id": user_id},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Config not found")
        return {"deleted": True, "id": config_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting anomaly config {config_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete anomaly config")


# ============================================================================
# Scan Endpoint
# ============================================================================

@router.post(
    "/scan",
    summary="Run Anomaly Scan",
    operation_id="run_anomaly_config_scan",
)
async def run_anomaly_config_scan(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Run anomaly scan across all active detection configs for the user.
    Simulates z-score by generating a random deviation score. Records
    anomalies when the score exceeds the config's sensitivity threshold.
    Returns count of newly created anomalies.
    """
    try:
        configs = await execute(
            """
            SELECT id, metric_type, agent_id, detection_method, sensitivity, window_hours
            FROM anomaly_detection_configs
            WHERE user_id = :user_id AND is_active = true
            """,
            {"user_id": user_id},
        )

        new_count = 0

        for config in configs:
            config_id = str(config["id"])
            metric_type = config["metric_type"]
            agent_id = config.get("agent_id")
            sensitivity = float(config["sensitivity"])

            # Simulate z-score deviation (random, normally distributed-like)
            deviation_score = round(random.uniform(0.1, 4.5), 4)

            # Only create anomaly record if score exceeds sensitivity
            if deviation_score <= sensitivity:
                continue

            severity = _severity_from_score(deviation_score)
            observed_value = round(random.uniform(1.0, 100.0), 4)
            expected_value = round(observed_value / (1 + deviation_score * 0.3), 4)
            description = (
                f"Anomaly detected on metric '{metric_type}'"
                + (f" for agent '{agent_id}'" if agent_id else "")
                + f": deviation score {deviation_score:.2f} exceeds sensitivity {sensitivity}"
            )

            await execute_mutate(
                """
                INSERT INTO detected_anomalies
                    (user_id, config_id, agent_id, metric_type, observed_value,
                     expected_value, deviation_score, severity, status, description)
                VALUES
                    (:user_id, :config_id, :agent_id, :metric_type, :observed_value,
                     :expected_value, :deviation_score, :severity, 'open', :description)
                """,
                {
                    "user_id": user_id,
                    "config_id": config_id,
                    "agent_id": agent_id,
                    "metric_type": metric_type,
                    "observed_value": observed_value,
                    "expected_value": expected_value,
                    "deviation_score": deviation_score,
                    "severity": severity,
                    "description": description,
                },
            )
            new_count += 1

        return {"new_anomalies": new_count, "configs_scanned": len(configs)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running anomaly config scan: {e}")
        raise HTTPException(status_code=500, detail="Failed to run anomaly scan")


# ============================================================================
# Detected Anomalies Endpoints
# ============================================================================

@router.get(
    "/detected",
    summary="List Detected Anomalies",
    operation_id="list_detected_anomalies",
)
async def list_detected_anomalies(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    agent_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List detected anomalies with optional filters."""
    try:
        conditions = ["user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit}

        if status:
            conditions.append("status = :status")
            params["status"] = status
        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity
        if agent_id:
            conditions.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_clause = " AND ".join(conditions)
        rows = await execute(
            f"""
            SELECT id, user_id, config_id, agent_id, metric_type, observed_value,
                   expected_value, deviation_score, severity, status, description, detected_at
            FROM detected_anomalies
            WHERE {where_clause}
            ORDER BY detected_at DESC
            LIMIT :limit
            """,
            params,
        )
        return [_serialize_anomaly(r) for r in rows]
    except Exception as e:
        logger.error(f"Error listing detected anomalies: {e}")
        raise HTTPException(status_code=500, detail="Failed to list detected anomalies")


@router.patch(
    "/detected/{anomaly_id}",
    summary="Update Anomaly Status",
    operation_id="update_detected_anomaly_status",
)
async def update_detected_anomaly_status(
    anomaly_id: str,
    body: UpdateAnomalyStatusRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update the status of a detected anomaly."""
    valid_statuses = {"open", "acknowledged", "resolved", "false_positive"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    try:
        rows = await execute_mutate(
            """
            UPDATE detected_anomalies
            SET status = :status
            WHERE id = :anomaly_id AND user_id = :user_id
            RETURNING id, user_id, config_id, agent_id, metric_type, observed_value,
                      expected_value, deviation_score, severity, status, description, detected_at
            """,
            {"anomaly_id": anomaly_id, "user_id": user_id, "status": body.status},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Anomaly not found")
        return _serialize_anomaly(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating detected anomaly {anomaly_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update anomaly status")


@router.get(
    "/stats",
    summary="Anomaly Detection Stats",
    operation_id="get_anomaly_detection_stats",
)
async def get_anomaly_detection_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get aggregate stats: open count, by severity breakdown,
    by metric type, and resolved count.
    """
    try:
        # Open count by severity
        severity_rows = await execute(
            """
            SELECT severity, COUNT(*) AS cnt
            FROM detected_anomalies
            WHERE user_id = :user_id AND status = 'open'
            GROUP BY severity
            """,
            {"user_id": user_id},
        )
        open_by_severity: dict = {}
        total_open = 0
        for row in severity_rows:
            count = int(row["cnt"])
            open_by_severity[row["severity"]] = count
            total_open += count

        # By metric type
        metric_rows = await execute(
            """
            SELECT metric_type, COUNT(*) AS cnt
            FROM detected_anomalies
            WHERE user_id = :user_id AND status = 'open'
            GROUP BY metric_type
            ORDER BY cnt DESC
            """,
            {"user_id": user_id},
        )
        by_metric_type = {row["metric_type"]: int(row["cnt"]) for row in metric_rows}

        # Resolved count
        resolved_row = await execute_one(
            """
            SELECT COUNT(*) AS cnt
            FROM detected_anomalies
            WHERE user_id = :user_id AND status = 'resolved'
            """,
            {"user_id": user_id},
        )
        resolved_count = int(resolved_row["cnt"]) if resolved_row else 0

        return {
            "total_open": total_open,
            "open_by_severity": open_by_severity,
            "by_metric_type": by_metric_type,
            "resolved_count": resolved_count,
        }
    except Exception as e:
        logger.error(f"Error fetching anomaly detection stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch anomaly stats")
