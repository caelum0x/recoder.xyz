"""
Resource Monitoring API endpoints.

Provides recording and querying of resource snapshots (CPU, memory, disk, network)
and alert rule management for threshold-based notifications.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/resources", tags=["resource-monitoring"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RecordSnapshotRequest(BaseModel):
    agent_id: Optional[str] = None
    cpu_percent: float = Field(default=0.0, ge=0, le=100)
    memory_mb: float = Field(default=0.0, ge=0)
    memory_percent: float = Field(default=0.0, ge=0, le=100)
    disk_mb: float = Field(default=0.0, ge=0)
    network_in_kb: float = Field(default=0.0, ge=0)
    network_out_kb: float = Field(default=0.0, ge=0)
    active_connections: int = Field(default=0, ge=0)


class CreateAlertRuleRequest(BaseModel):
    agent_id: Optional[str] = None
    metric: str = Field(..., description="cpu_percent | memory_percent | disk_mb | active_connections")
    threshold: float
    comparison: str = Field(default="gt", description="gt | lt | eq")
    cooldown_minutes: int = Field(default=15, ge=1, le=1440)


class UpdateAlertRuleRequest(BaseModel):
    metric: Optional[str] = None
    threshold: Optional[float] = None
    comparison: Optional[str] = None
    is_active: Optional[bool] = None
    cooldown_minutes: Optional[int] = None


class AlertCheckResult(BaseModel):
    rule_id: str
    agent_id: Optional[str]
    metric: str
    threshold: float
    comparison: str
    current_value: float
    triggered: bool


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/snapshot",
    summary="Record resource snapshot",
    operation_id="record_resource_snapshot",
)
async def record_snapshot(
    body: RecordSnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a resource utilization snapshot for the authenticated user."""
    try:
        row = await execute_one(
            """
            INSERT INTO resource_snapshots (
                id, user_id, agent_id,
                cpu_percent, memory_mb, memory_percent,
                disk_mb, network_in_kb, network_out_kb,
                active_connections, recorded_at
            ) VALUES (
                :id, :user_id, :agent_id,
                :cpu_percent, :memory_mb, :memory_percent,
                :disk_mb, :network_in_kb, :network_out_kb,
                :active_connections, now()
            )
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "agent_id": body.agent_id,
                "cpu_percent": body.cpu_percent,
                "memory_mb": body.memory_mb,
                "memory_percent": body.memory_percent,
                "disk_mb": body.disk_mb,
                "network_in_kb": body.network_in_kb,
                "network_out_kb": body.network_out_kb,
                "active_connections": body.active_connections,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error recording resource snapshot: {e}")
        raise HTTPException(status_code=500, detail="Failed to record snapshot")


@router.get(
    "/snapshots",
    summary="List resource snapshots",
    operation_id="list_resource_snapshots",
)
async def list_snapshots(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    minutes: int = Query(60, ge=1, le=10080, description="Time window in minutes"),
    limit: int = Query(100, ge=1, le=1000),
):
    """List resource snapshots within the given time window."""
    try:
        where_clauses = [
            "user_id = :user_id",
            "recorded_at >= now() - :minutes * INTERVAL '1 minute'",
        ]
        params: Dict[str, Any] = {"user_id": user_id, "minutes": minutes, "limit": limit}

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_clauses)
        rows = await execute(
            f"""
            SELECT * FROM resource_snapshots
            WHERE {where_sql}
            ORDER BY recorded_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing resource snapshots: {e}")
        raise HTTPException(status_code=500, detail="Failed to list snapshots")


@router.get(
    "/current",
    summary="Get current resource summary",
    operation_id="get_current_resources",
)
async def get_current_resources(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return the latest snapshot per agent for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT DISTINCT ON (COALESCE(agent_id, 'global'))
                id, user_id, agent_id,
                cpu_percent, memory_mb, memory_percent,
                disk_mb, network_in_kb, network_out_kb,
                active_connections, recorded_at
            FROM resource_snapshots
            WHERE user_id = :user_id
            ORDER BY COALESCE(agent_id, 'global'), recorded_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error fetching current resources: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch current resources")


@router.get(
    "/history",
    summary="Get aggregated resource history",
    operation_id="get_resource_history",
)
async def get_resource_history(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None),
    minutes: int = Query(60, ge=5, le=10080),
    interval_minutes: int = Query(5, ge=1, le=60, description="Aggregation bucket size"),
):
    """Return time-bucketed averages for CPU, memory, and other metrics."""
    try:
        where_clauses = [
            "user_id = :user_id",
            "recorded_at >= now() - :minutes * INTERVAL '1 minute'",
        ]
        params: Dict[str, Any] = {
            "user_id": user_id,
            "minutes": minutes,
            "interval_minutes": interval_minutes,
        }

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_clauses)
        rows = await execute(
            f"""
            SELECT
                date_trunc('minute', recorded_at) -
                    (EXTRACT(MINUTE FROM recorded_at)::int % :interval_minutes) * INTERVAL '1 minute'
                    AS bucket,
                AVG(cpu_percent) AS avg_cpu,
                AVG(memory_percent) AS avg_memory,
                AVG(disk_mb) AS avg_disk,
                AVG(network_in_kb) AS avg_network_in,
                AVG(network_out_kb) AS avg_network_out,
                AVG(active_connections) AS avg_connections
            FROM resource_snapshots
            WHERE {where_sql}
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error fetching resource history: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch resource history")


@router.post(
    "/alert-rules",
    summary="Create alert rule",
    operation_id="create_resource_alert_rule",
)
async def create_alert_rule(
    body: CreateAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new resource alert rule."""
    valid_metrics = {"cpu_percent", "memory_percent", "disk_mb", "active_connections"}
    if body.metric not in valid_metrics:
        raise HTTPException(status_code=400, detail=f"metric must be one of: {', '.join(valid_metrics)}")
    valid_comparisons = {"gt", "lt", "eq"}
    if body.comparison not in valid_comparisons:
        raise HTTPException(status_code=400, detail=f"comparison must be one of: {', '.join(valid_comparisons)}")

    try:
        row = await execute_one(
            """
            INSERT INTO resource_alert_rules (
                id, user_id, agent_id, metric, threshold,
                comparison, is_active, cooldown_minutes
            ) VALUES (
                :id, :user_id, :agent_id, :metric, :threshold,
                :comparison, true, :cooldown_minutes
            )
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "agent_id": body.agent_id,
                "metric": body.metric,
                "threshold": body.threshold,
                "comparison": body.comparison,
                "cooldown_minutes": body.cooldown_minutes,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating alert rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create alert rule")


@router.get(
    "/alert-rules",
    summary="List alert rules",
    operation_id="list_resource_alert_rules",
)
async def list_alert_rules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all resource alert rules for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM resource_alert_rules
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing alert rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to list alert rules")


@router.patch(
    "/alert-rules/{rule_id}",
    summary="Update alert rule",
    operation_id="update_resource_alert_rule",
)
async def update_alert_rule(
    rule_id: str,
    body: UpdateAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a resource alert rule."""
    existing = await execute_one(
        "SELECT id FROM resource_alert_rules WHERE id = :id AND user_id = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    valid_metrics = {"cpu_percent", "memory_percent", "disk_mb", "active_connections"}
    if "metric" in updates and updates["metric"] not in valid_metrics:
        raise HTTPException(status_code=400, detail=f"metric must be one of: {', '.join(valid_metrics)}")
    valid_comparisons = {"gt", "lt", "eq"}
    if "comparison" in updates and updates["comparison"] not in valid_comparisons:
        raise HTTPException(status_code=400, detail=f"comparison must be one of: {', '.join(valid_comparisons)}")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "id": rule_id, "user_id": user_id}

    try:
        row = await execute_one(
            f"""
            UPDATE resource_alert_rules
            SET {set_clauses}
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error updating alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update alert rule")


@router.delete(
    "/alert-rules/{rule_id}",
    summary="Delete alert rule",
    operation_id="delete_resource_alert_rule",
)
async def delete_alert_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a resource alert rule."""
    existing = await execute_one(
        "SELECT id FROM resource_alert_rules WHERE id = :id AND user_id = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    try:
        await execute_mutate(
            "DELETE FROM resource_alert_rules WHERE id = :id AND user_id = :user_id",
            {"id": rule_id, "user_id": user_id},
        )
        return {"success": True, "deleted_id": rule_id}
    except Exception as e:
        logger.error(f"Error deleting alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete alert rule")


@router.post(
    "/check-alerts",
    summary="Check alerts against current snapshots",
    operation_id="check_resource_alerts",
)
async def check_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Evaluate active alert rules against the latest resource snapshots."""
    try:
        rules = await execute(
            """
            SELECT * FROM resource_alert_rules
            WHERE user_id = :user_id AND is_active = true
            """,
            {"user_id": user_id},
        )
        if not rules:
            return {"triggered": [], "checked": 0}

        current_rows = await execute(
            """
            SELECT DISTINCT ON (COALESCE(agent_id, 'global'))
                agent_id, cpu_percent, memory_percent, disk_mb, active_connections
            FROM resource_snapshots
            WHERE user_id = :user_id
              AND recorded_at >= now() - INTERVAL '10 minutes'
            ORDER BY COALESCE(agent_id, 'global'), recorded_at DESC
            """,
            {"user_id": user_id},
        )

        # Build lookup: agent_id -> snapshot
        snapshot_map: Dict[Optional[str], Dict] = {}
        for snap in (current_rows or []):
            key = snap.get("agent_id")
            snapshot_map[key] = snap

        triggered = []
        checked = 0

        for rule in rules:
            rule_agent = rule.get("agent_id")
            snapshot = snapshot_map.get(rule_agent) or snapshot_map.get(None)
            if not snapshot:
                continue

            metric = rule["metric"]
            current_val = float(snapshot.get(metric) or 0)
            threshold = float(rule["threshold"])
            comparison = rule["comparison"]
            checked += 1

            fired = False
            if comparison == "gt" and current_val > threshold:
                fired = True
            elif comparison == "lt" and current_val < threshold:
                fired = True
            elif comparison == "eq" and current_val == threshold:
                fired = True

            # Respect cooldown
            if fired and rule.get("last_triggered_at"):
                last = rule["last_triggered_at"]
                if isinstance(last, str):
                    last = datetime.fromisoformat(last.replace("Z", "+00:00"))
                cooldown = timedelta(minutes=int(rule.get("cooldown_minutes") or 15))
                if datetime.now(timezone.utc) - last < cooldown:
                    fired = False

            if fired:
                await execute_mutate(
                    """
                    UPDATE resource_alert_rules
                    SET last_triggered_at = now()
                    WHERE id = :id AND user_id = :user_id
                    """,
                    {"id": str(rule["id"]), "user_id": user_id},
                )
                triggered.append({
                    "rule_id": str(rule["id"]),
                    "agent_id": rule_agent,
                    "metric": metric,
                    "threshold": threshold,
                    "comparison": comparison,
                    "current_value": current_val,
                    "triggered": True,
                })

        return {"triggered": triggered, "checked": checked}
    except Exception as e:
        logger.error(f"Error checking resource alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to check alerts")
