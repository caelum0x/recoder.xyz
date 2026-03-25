"""
Agent Cost Alerts API endpoints.

CRUD for per-agent cost alert rules + alert history + manual cost check.
"""

import random
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/agent-cost-alerts", tags=["agent-cost-alerts"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateCostAlertRuleRequest(BaseModel):
    agent_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=200)
    threshold_amount: float = Field(..., gt=0)
    threshold_period: str = "daily"
    alert_type: str = "warning"


class UpdateCostAlertRuleRequest(BaseModel):
    name: Optional[str] = None
    threshold_amount: Optional[float] = None
    threshold_period: Optional[str] = None
    alert_type: Optional[str] = None
    is_active: Optional[bool] = None


class UpdateCostAlertHistoryRequest(BaseModel):
    status: str = Field(..., description="New status: acknowledged or resolved")


# ============================================================================
# Helpers
# ============================================================================

def _serialize_row(row: dict) -> dict:
    """Serialize a row for JSON response."""
    result = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif isinstance(v, (bytes, memoryview)):
            result[k] = str(v)
        else:
            result[k] = v
    if "id" in result:
        result["id"] = str(result["id"])
    if "user_id" in result:
        result["user_id"] = str(result["user_id"])
    if "rule_id" in result:
        result["rule_id"] = str(result["rule_id"])
    # Convert Decimal to float for threshold/triggered amounts
    if "threshold_amount" in result and result["threshold_amount"] is not None:
        result["threshold_amount"] = float(result["threshold_amount"])
    if "triggered_amount" in result and result["triggered_amount"] is not None:
        result["triggered_amount"] = float(result["triggered_amount"])
    return result


# ============================================================================
# Rules Endpoints
# ============================================================================

@router.post(
    "/rules",
    summary="Create Cost Alert Rule",
    operation_id="create_cost_alert_rule",
)
async def create_cost_alert_rule(
    body: CreateCostAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new cost alert rule."""
    valid_periods = {"hourly", "daily", "weekly", "monthly"}
    if body.threshold_period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid threshold_period: {body.threshold_period}. Must be one of: {', '.join(valid_periods)}"
        )

    valid_types = {"info", "warning", "critical"}
    if body.alert_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid alert_type: {body.alert_type}. Must be one of: {', '.join(valid_types)}"
        )

    try:
        rows = await execute_mutate(
            """
            INSERT INTO agent_cost_alert_rules
                (user_id, agent_id, name, threshold_amount, threshold_period, alert_type)
            VALUES
                (:user_id, :agent_id, :name, :threshold_amount, :threshold_period, :alert_type)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "name": body.name,
                "threshold_amount": body.threshold_amount,
                "threshold_period": body.threshold_period,
                "alert_type": body.alert_type,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create cost alert rule")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "unique" in error_msg.lower() or "duplicate" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail="A rule already exists for this agent and period combination"
            )
        logger.error(f"Error creating cost alert rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create cost alert rule")


@router.get(
    "/rules",
    summary="List Cost Alert Rules",
    operation_id="list_cost_alert_rules",
)
async def list_cost_alert_rules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all cost alert rules for the user."""
    try:
        rows = await execute(
            """
            SELECT r.*, a.name AS agent_name
            FROM agent_cost_alert_rules r
            LEFT JOIN agents a ON a.agent_id::text = r.agent_id::text
            WHERE r.user_id::text = :user_id
            ORDER BY r.created_at DESC
            """,
            {"user_id": user_id},
        )

        return [_serialize_row(row) for row in rows]

    except Exception as e:
        logger.error(f"Error listing cost alert rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cost alert rules")


@router.patch(
    "/rules/{rule_id}",
    summary="Update Cost Alert Rule",
    operation_id="update_cost_alert_rule",
)
async def update_cost_alert_rule(
    rule_id: str,
    body: UpdateCostAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a cost alert rule."""
    if body.threshold_period:
        valid_periods = {"hourly", "daily", "weekly", "monthly"}
        if body.threshold_period not in valid_periods:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid threshold_period: {body.threshold_period}. Must be one of: {', '.join(valid_periods)}"
            )

    if body.alert_type:
        valid_types = {"info", "warning", "critical"}
        if body.alert_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid alert_type: {body.alert_type}. Must be one of: {', '.join(valid_types)}"
            )

    try:
        set_parts = []
        params: dict = {"rule_id": rule_id, "user_id": user_id}

        if body.name is not None:
            set_parts.append("name = :name")
            params["name"] = body.name

        if body.threshold_amount is not None:
            set_parts.append("threshold_amount = :threshold_amount")
            params["threshold_amount"] = body.threshold_amount

        if body.threshold_period is not None:
            set_parts.append("threshold_period = :threshold_period")
            params["threshold_period"] = body.threshold_period

        if body.alert_type is not None:
            set_parts.append("alert_type = :alert_type")
            params["alert_type"] = body.alert_type

        if body.is_active is not None:
            set_parts.append("is_active = :is_active")
            params["is_active"] = body.is_active

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(set_parts)

        rows = await execute_mutate(
            f"""
            UPDATE agent_cost_alert_rules
            SET {set_clause}
            WHERE id = :rule_id AND user_id::text = :user_id
            RETURNING *
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Cost alert rule not found")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cost alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update cost alert rule")


@router.delete(
    "/rules/{rule_id}",
    summary="Delete Cost Alert Rule",
    operation_id="delete_cost_alert_rule",
)
async def delete_cost_alert_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a cost alert rule (cascades to history)."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM agent_cost_alert_rules
            WHERE id = :rule_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"rule_id": rule_id, "user_id": user_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Cost alert rule not found")

        return {"deleted": True, "id": str(rows[0]["id"])}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cost alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete cost alert rule")


# ============================================================================
# Check Endpoint
# ============================================================================

@router.post(
    "/check",
    summary="Check Cost Alerts",
    operation_id="check_cost_alerts",
)
async def check_cost_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Check all active rules against current costs.
    Simulates cost lookup with random values for now.
    Creates history entries for rules that exceed their threshold.
    """
    try:
        # Get all active rules
        rules = await execute(
            """
            SELECT *
            FROM agent_cost_alert_rules
            WHERE user_id::text = :user_id AND is_active = true
            """,
            {"user_id": user_id},
        )

        triggered = []
        for rule in rules:
            # Simulate cost lookup (random value between 0 and 2x threshold)
            threshold = float(rule["threshold_amount"])
            simulated_cost = round(random.uniform(0, threshold * 2), 4)

            if simulated_cost >= threshold:
                # Create history entry
                history_rows = await execute_mutate(
                    """
                    INSERT INTO agent_cost_alert_history
                        (rule_id, user_id, agent_id, triggered_amount, threshold_amount)
                    VALUES
                        (:rule_id, :user_id, :agent_id, :triggered_amount, :threshold_amount)
                    RETURNING *
                    """,
                    {
                        "rule_id": str(rule["id"]),
                        "user_id": user_id,
                        "agent_id": rule["agent_id"],
                        "triggered_amount": simulated_cost,
                        "threshold_amount": threshold,
                    },
                )
                if history_rows:
                    triggered.append(_serialize_row(history_rows[0]))

        return {
            "checked": len(rules),
            "triggered": len(triggered),
            "alerts": triggered,
        }

    except Exception as e:
        logger.error(f"Error checking cost alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to check cost alerts")


# ============================================================================
# History Endpoints
# ============================================================================

@router.get(
    "/history",
    summary="List Cost Alert History",
    operation_id="list_cost_alert_history",
)
async def list_cost_alert_history(
    status: Optional[str] = Query(default=None),
    agent_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List cost alert history with optional filters."""
    try:
        conditions = ["h.user_id::text = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit}

        if status:
            conditions.append("h.status = :status")
            params["status"] = status

        if agent_id:
            conditions.append("h.agent_id::text = :agent_id")
            params["agent_id"] = agent_id

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT h.*, r.name AS rule_name, r.threshold_period, r.alert_type,
                   a.name AS agent_name
            FROM agent_cost_alert_history h
            LEFT JOIN agent_cost_alert_rules r ON r.id::text = h.rule_id::text
            LEFT JOIN agents a ON a.agent_id::text = h.agent_id::text
            WHERE {where_clause}
            ORDER BY h.triggered_at DESC
            LIMIT :limit
            """,
            params,
        )

        return [_serialize_row(row) for row in rows]

    except Exception as e:
        logger.error(f"Error listing cost alert history: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cost alert history")


@router.patch(
    "/history/{alert_id}",
    summary="Update Cost Alert Status",
    operation_id="update_cost_alert_status",
)
async def update_cost_alert_status(
    alert_id: str,
    body: UpdateCostAlertHistoryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Acknowledge or resolve a cost alert."""
    valid_statuses = {"triggered", "acknowledged", "resolved"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {body.status}. Must be one of: {', '.join(valid_statuses)}"
        )

    try:
        rows = await execute_mutate(
            """
            UPDATE agent_cost_alert_history
            SET status = :status
            WHERE id = :alert_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"alert_id": alert_id, "user_id": user_id, "status": body.status},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cost alert {alert_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update cost alert")
