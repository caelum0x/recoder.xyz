"""
Cost Threshold Alerts API.

CRUD for cost alert rules + history of triggered alerts + manual check.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/cost-alerts", tags=["cost-alerts"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateCostAlertRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Alert rule name")
    alert_type: str = Field(
        default="monthly_spend",
        description="Type: monthly_spend, daily_spend, per_agent, per_model",
    )
    threshold_amount: float = Field(..., gt=0, description="Dollar threshold")
    agent_id: Optional[str] = Field(None, description="Agent ID for per_agent alerts")
    model_filter: Optional[str] = Field(None, description="Model name for per_model alerts")
    notify_channels: List[str] = Field(
        default=["in_app"],
        description="Notification channels: in_app, email",
    )


class UpdateCostAlertRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    threshold_amount: Optional[float] = Field(None, gt=0)
    agent_id: Optional[str] = None
    model_filter: Optional[str] = None
    notify_channels: Optional[List[str]] = None
    active: Optional[bool] = None


class CostAlertRuleResponse(BaseModel):
    id: str
    name: str
    alert_type: str
    threshold_amount: float
    agent_id: Optional[str] = None
    model_filter: Optional[str] = None
    notify_channels: List[str] = ["in_app"]
    active: bool = True
    last_triggered_at: Optional[str] = None
    created_at: str
    updated_at: str


class CostAlertHistoryItem(BaseModel):
    id: str
    rule_id: str
    alert_type: str
    threshold_amount: float
    actual_amount: float
    percentage_of_threshold: float
    agent_id: Optional[str] = None
    model_filter: Optional[str] = None
    message: Optional[str] = None
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    created_at: str


class CostAlertHistoryResponse(BaseModel):
    alerts: List[CostAlertHistoryItem] = []
    total: int = 0


class CheckResult(BaseModel):
    rules_checked: int = 0
    alerts_triggered: int = 0
    results: List[Dict[str, Any]] = []


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _ts_opt(val: Any) -> Optional[str]:
    if val is None:
        return None
    return _ts(val)


def _row_to_rule(r: dict) -> CostAlertRuleResponse:
    return CostAlertRuleResponse(
        id=str(r["id"]),
        name=r["name"],
        alert_type=r["alert_type"],
        threshold_amount=float(r["threshold_amount"]),
        agent_id=r.get("agent_id"),
        model_filter=r.get("model_filter"),
        notify_channels=r.get("notify_channels", ["in_app"]),
        active=r.get("active", True),
        last_triggered_at=_ts_opt(r.get("last_triggered_at")),
        created_at=_ts(r["created_at"]),
        updated_at=_ts(r["updated_at"]),
    )


def _row_to_history(r: dict) -> CostAlertHistoryItem:
    return CostAlertHistoryItem(
        id=str(r["id"]),
        rule_id=str(r["rule_id"]),
        alert_type=r["alert_type"],
        threshold_amount=float(r["threshold_amount"]),
        actual_amount=float(r["actual_amount"]),
        percentage_of_threshold=float(r["percentage_of_threshold"]),
        agent_id=r.get("agent_id"),
        model_filter=r.get("model_filter"),
        message=r.get("message"),
        acknowledged=r.get("acknowledged", False),
        acknowledged_at=_ts_opt(r.get("acknowledged_at")),
        created_at=_ts(r["created_at"]),
    )


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.post("", response_model=CostAlertRuleResponse, summary="Create cost alert rule")
async def create_cost_alert(
    body: CreateCostAlertRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new cost alert rule."""
    try:
        valid_types = {"monthly_spend", "daily_spend", "per_agent", "per_model"}
        if body.alert_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid alert_type. Must be one of: {', '.join(sorted(valid_types))}",
            )

        row = await execute_one(
            """INSERT INTO cost_alert_rules
                   (account_id, name, alert_type, threshold_amount, agent_id, model_filter, notify_channels)
               VALUES
                   (:account_id, :name, :alert_type, :threshold_amount, :agent_id, :model_filter, :notify_channels)
               RETURNING *""",
            {
                "account_id": user_id,
                "name": body.name,
                "alert_type": body.alert_type,
                "threshold_amount": body.threshold_amount,
                "agent_id": body.agent_id,
                "model_filter": body.model_filter,
                "notify_channels": body.notify_channels,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create cost alert rule")

        return _row_to_rule(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cost alert rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create cost alert rule")


@router.get("", response_model=List[CostAlertRuleResponse], summary="List cost alert rules")
async def list_cost_alerts(
    active_only: bool = Query(False, description="Only return active rules"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all cost alert rules for the authenticated account."""
    try:
        where = "account_id = :account_id"
        params: Dict[str, Any] = {"account_id": user_id}

        if active_only:
            where += " AND active = true"

        rows = await execute(
            f"""SELECT * FROM cost_alert_rules
                WHERE {where}
                ORDER BY created_at DESC""",
            params,
        )

        return [_row_to_rule(r) for r in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing cost alert rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cost alert rules")


@router.patch(
    "/{rule_id}",
    response_model=CostAlertRuleResponse,
    summary="Update cost alert rule",
)
async def update_cost_alert(
    rule_id: str,
    body: UpdateCostAlertRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing cost alert rule."""
    try:
        existing = await execute_one(
            "SELECT id FROM cost_alert_rules WHERE id = :id AND account_id = :account_id",
            {"id": rule_id, "account_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cost alert rule not found")

        set_parts = ["updated_at = now()"]
        params: Dict[str, Any] = {"id": rule_id, "account_id": user_id}

        if body.name is not None:
            set_parts.append("name = :name")
            params["name"] = body.name
        if body.threshold_amount is not None:
            set_parts.append("threshold_amount = :threshold_amount")
            params["threshold_amount"] = body.threshold_amount
        if body.agent_id is not None:
            set_parts.append("agent_id = :agent_id")
            params["agent_id"] = body.agent_id if body.agent_id else None
        if body.model_filter is not None:
            set_parts.append("model_filter = :model_filter")
            params["model_filter"] = body.model_filter if body.model_filter else None
        if body.notify_channels is not None:
            set_parts.append("notify_channels = :notify_channels")
            params["notify_channels"] = body.notify_channels
        if body.active is not None:
            set_parts.append("active = :active")
            params["active"] = body.active

        set_sql = ", ".join(set_parts)

        row = await execute_one(
            f"""UPDATE cost_alert_rules SET {set_sql}
                WHERE id = :id AND account_id = :account_id
                RETURNING *""",
            params,
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update cost alert rule")

        return _row_to_rule(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cost alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update cost alert rule")


@router.delete("/{rule_id}", summary="Delete cost alert rule")
async def delete_cost_alert(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a cost alert rule and its history."""
    try:
        existing = await execute_one(
            "SELECT id FROM cost_alert_rules WHERE id = :id AND account_id = :account_id",
            {"id": rule_id, "account_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cost alert rule not found")

        await execute_mutate(
            "DELETE FROM cost_alert_rules WHERE id = :id AND account_id = :account_id",
            {"id": rule_id, "account_id": user_id},
        )

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cost alert rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete cost alert rule")


# ============================================================================
# History
# ============================================================================

@router.get(
    "/history",
    response_model=CostAlertHistoryResponse,
    summary="Cost alert trigger history",
)
async def get_alert_history(
    rule_id: Optional[str] = Query(None, description="Filter by rule ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the history of triggered cost alerts."""
    try:
        where_parts = ["account_id = :account_id"]
        params: Dict[str, Any] = {"account_id": user_id, "limit": limit, "offset": offset}

        if rule_id:
            where_parts.append("rule_id = :rule_id")
            params["rule_id"] = rule_id

        where_sql = " AND ".join(where_parts)

        count_row = await execute_one(
            f"SELECT COUNT(*) as cnt FROM cost_alert_history WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            f"""SELECT * FROM cost_alert_history
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        alerts = [_row_to_history(r) for r in (rows or [])]
        return CostAlertHistoryResponse(alerts=alerts, total=total)

    except Exception as e:
        logger.error(f"Error getting cost alert history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get alert history")


# ============================================================================
# Manual Check
# ============================================================================

@router.post(
    "/check",
    response_model=CheckResult,
    summary="Check cost alert rules now",
)
async def check_alerts_now(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Manually check all active cost alert rules against current spending data."""
    try:
        rules = await execute(
            """SELECT * FROM cost_alert_rules
               WHERE account_id = :account_id AND active = true
               ORDER BY created_at""",
            {"account_id": user_id},
        )

        if not rules:
            return CheckResult(rules_checked=0, alerts_triggered=0, results=[])

        results = []
        alerts_triggered = 0

        for rule in rules:
            rule_id = str(rule["id"])
            alert_type = rule["alert_type"]
            threshold = float(rule["threshold_amount"])
            agent_id = rule.get("agent_id")
            model_filter = rule.get("model_filter")

            actual_amount = 0.0

            try:
                if alert_type == "monthly_spend":
                    cost_row = await execute_one(
                        """SELECT COALESCE(SUM(ABS(amount)), 0) as total
                           FROM credit_transactions
                           WHERE user_id = :user_id
                             AND type = 'debit'
                             AND created_at >= date_trunc('month', now())""",
                        {"user_id": user_id},
                    )
                    actual_amount = float(cost_row["total"]) if cost_row else 0.0

                elif alert_type == "daily_spend":
                    cost_row = await execute_one(
                        """SELECT COALESCE(SUM(ABS(amount)), 0) as total
                           FROM credit_transactions
                           WHERE user_id = :user_id
                             AND type = 'debit'
                             AND created_at >= date_trunc('day', now())""",
                        {"user_id": user_id},
                    )
                    actual_amount = float(cost_row["total"]) if cost_row else 0.0

                elif alert_type == "per_agent" and agent_id:
                    cost_row = await execute_one(
                        """SELECT COALESCE(SUM(ABS(amount)), 0) as total
                           FROM credit_transactions
                           WHERE user_id = :user_id
                             AND type = 'debit'
                             AND reference_type = 'agent_run'
                             AND reference_id = :agent_id
                             AND created_at >= date_trunc('month', now())""",
                        {"user_id": user_id, "agent_id": agent_id},
                    )
                    actual_amount = float(cost_row["total"]) if cost_row else 0.0

                elif alert_type == "per_model" and model_filter:
                    cost_row = await execute_one(
                        """SELECT COALESCE(SUM(ABS(amount)), 0) as total
                           FROM credit_transactions
                           WHERE user_id = :user_id
                             AND type = 'debit'
                             AND description ILIKE :model_pattern
                             AND created_at >= date_trunc('month', now())""",
                        {"user_id": user_id, "model_pattern": f"%{model_filter}%"},
                    )
                    actual_amount = float(cost_row["total"]) if cost_row else 0.0

            except Exception as query_err:
                logger.warning(f"Error checking cost for rule {rule_id}: {query_err}")
                results.append({
                    "rule_id": rule_id,
                    "name": rule["name"],
                    "status": "error",
                    "error": str(query_err)[:200],
                })
                continue

            percentage = (actual_amount / threshold * 100) if threshold > 0 else 0

            triggered = actual_amount >= threshold
            result_entry = {
                "rule_id": rule_id,
                "name": rule["name"],
                "alert_type": alert_type,
                "threshold": threshold,
                "actual": round(actual_amount, 4),
                "percentage": round(percentage, 2),
                "triggered": triggered,
            }

            if triggered:
                alerts_triggered += 1
                message = f"Cost alert: {rule['name']} - spent ${actual_amount:.4f} ({percentage:.1f}% of ${threshold:.2f} threshold)"

                await execute_mutate(
                    """INSERT INTO cost_alert_history
                           (rule_id, account_id, alert_type, threshold_amount, actual_amount,
                            percentage_of_threshold, agent_id, model_filter, message)
                       VALUES
                           (:rule_id, :account_id, :alert_type, :threshold_amount, :actual_amount,
                            :percentage, :agent_id, :model_filter, :message)""",
                    {
                        "rule_id": rule_id,
                        "account_id": user_id,
                        "alert_type": alert_type,
                        "threshold_amount": threshold,
                        "actual_amount": actual_amount,
                        "percentage": percentage,
                        "agent_id": agent_id,
                        "model_filter": model_filter,
                        "message": message,
                    },
                )

                await execute_mutate(
                    """UPDATE cost_alert_rules
                       SET last_triggered_at = now(), updated_at = now()
                       WHERE id = :id""",
                    {"id": rule_id},
                )

            results.append(result_entry)

        return CheckResult(
            rules_checked=len(rules),
            alerts_triggered=alerts_triggered,
            results=results,
        )

    except Exception as e:
        logger.error(f"Error checking cost alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to check cost alerts")
