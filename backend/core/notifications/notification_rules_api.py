"""
Notification Rules Engine API.

CRUD for notification rules, test execution, and rule execution log.
Rules define trigger events, conditions, and actions (in_app, email, webhook).
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/notification-rules", tags=["notification-rules"])


# ============================================================================
# Constants
# ============================================================================

VALID_TRIGGER_EVENTS = {
    "run_completed",
    "run_failed",
    "cost_exceeded",
    "agent_error",
    "health_degraded",
    "quota_warning",
    "thread_completed",
    "schedule_missed",
}

VALID_OPERATORS = {"equals", "not_equals", "greater_than", "less_than", "contains"}

VALID_ACTION_TYPES = {"in_app", "email", "webhook"}


# ============================================================================
# Pydantic Models
# ============================================================================

class RuleCondition(BaseModel):
    field: str = Field(..., min_length=1, max_length=200)
    operator: str = Field(..., description="equals, not_equals, greater_than, less_than, contains")
    value: Any


class RuleAction(BaseModel):
    type: str = Field(..., description="in_app, email, webhook")
    config: Dict[str, Any] = Field(default_factory=dict)


class CreateNotificationRuleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_event: str = Field(..., description="Event that triggers this rule")
    conditions: List[RuleCondition] = Field(default_factory=list)
    actions: List[RuleAction] = Field(default_factory=list)
    cooldown_minutes: int = Field(default=0, ge=0)


class UpdateNotificationRuleRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_event: Optional[str] = None
    conditions: Optional[List[RuleCondition]] = None
    actions: Optional[List[RuleAction]] = None
    is_active: Optional[bool] = None
    cooldown_minutes: Optional[int] = Field(None, ge=0)


class NotificationRuleResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    trigger_event: str
    conditions: List[Dict[str, Any]] = []
    actions: List[Dict[str, Any]] = []
    is_active: bool = True
    last_triggered_at: Optional[str] = None
    trigger_count: int = 0
    cooldown_minutes: int = 0
    created_at: str
    updated_at: str


class NotificationRuleDetailResponse(NotificationRuleResponse):
    recent_logs: List[Dict[str, Any]] = []


class RuleLogEntry(BaseModel):
    id: str
    rule_id: str
    trigger_event: str
    conditions_met: Dict[str, Any] = {}
    actions_taken: List[Dict[str, Any]] = []
    created_at: str


class RuleLogListResponse(BaseModel):
    logs: List[RuleLogEntry] = []
    total: int = 0


class TestRuleResult(BaseModel):
    rule_id: str
    rule_name: str
    trigger_event: str
    conditions_evaluated: List[Dict[str, Any]] = []
    all_conditions_met: bool = False
    actions_that_would_fire: List[Dict[str, Any]] = []
    cooldown_active: bool = False


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


def _row_to_rule(r: dict) -> NotificationRuleResponse:
    conditions = r.get("conditions") or []
    actions = r.get("actions") or []
    # Handle if stored as string
    if isinstance(conditions, str):
        conditions = json.loads(conditions)
    if isinstance(actions, str):
        actions = json.loads(actions)

    return NotificationRuleResponse(
        id=str(r["id"]),
        name=r["name"],
        description=r.get("description"),
        trigger_event=r["trigger_event"],
        conditions=conditions,
        actions=actions,
        is_active=r.get("is_active", True),
        last_triggered_at=_ts_opt(r.get("last_triggered_at")),
        trigger_count=r.get("trigger_count", 0),
        cooldown_minutes=r.get("cooldown_minutes", 0),
        created_at=_ts(r["created_at"]),
        updated_at=_ts(r["updated_at"]),
    )


def _row_to_log(r: dict) -> RuleLogEntry:
    conditions_met = r.get("conditions_met") or {}
    actions_taken = r.get("actions_taken") or []
    if isinstance(conditions_met, str):
        conditions_met = json.loads(conditions_met)
    if isinstance(actions_taken, str):
        actions_taken = json.loads(actions_taken)

    return RuleLogEntry(
        id=str(r["id"]),
        rule_id=str(r["rule_id"]),
        trigger_event=r["trigger_event"],
        conditions_met=conditions_met,
        actions_taken=actions_taken,
        created_at=_ts(r["created_at"]),
    )


def _evaluate_condition(condition: Dict[str, Any], mock_data: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate a single condition against mock data."""
    field = condition.get("field", "")
    operator = condition.get("operator", "equals")
    expected = condition.get("value")
    actual = mock_data.get(field)

    result = {"field": field, "operator": operator, "expected": expected, "actual": actual}

    if actual is None:
        result["met"] = False
        result["reason"] = f"Field '{field}' not found in event data"
        return result

    try:
        if operator == "equals":
            result["met"] = str(actual) == str(expected)
        elif operator == "not_equals":
            result["met"] = str(actual) != str(expected)
        elif operator == "greater_than":
            result["met"] = float(actual) > float(expected)
        elif operator == "less_than":
            result["met"] = float(actual) < float(expected)
        elif operator == "contains":
            result["met"] = str(expected).lower() in str(actual).lower()
        else:
            result["met"] = False
            result["reason"] = f"Unknown operator: {operator}"
    except (ValueError, TypeError) as e:
        result["met"] = False
        result["reason"] = str(e)

    return result


# Mock data generators for test endpoint
MOCK_EVENT_DATA = {
    "run_completed": {
        "run_id": "test-run-001",
        "agent_id": "test-agent-001",
        "status": "completed",
        "duration_ms": 45000,
        "tokens_used": 15000,
        "cost": 0.0234,
        "model": "claude-sonnet-4",
    },
    "run_failed": {
        "run_id": "test-run-002",
        "agent_id": "test-agent-002",
        "status": "error",
        "error_type": "timeout",
        "error_message": "Agent run exceeded maximum time limit",
        "duration_ms": 120000,
    },
    "cost_exceeded": {
        "threshold": 10.00,
        "actual_cost": 12.50,
        "period": "daily",
        "agent_id": "test-agent-001",
    },
    "agent_error": {
        "agent_id": "test-agent-003",
        "error_type": "runtime_error",
        "error_message": "Tool execution failed",
        "severity": "high",
    },
    "health_degraded": {
        "service": "sandbox",
        "status": "degraded",
        "latency_ms": 5000,
        "error_rate": 0.15,
    },
    "quota_warning": {
        "resource": "credits",
        "usage_pct": 85,
        "remaining": 15.00,
        "total": 100.00,
    },
    "thread_completed": {
        "thread_id": "test-thread-001",
        "agent_id": "test-agent-001",
        "message_count": 12,
        "duration_ms": 30000,
    },
    "schedule_missed": {
        "trigger_id": "test-trigger-001",
        "agent_id": "test-agent-001",
        "scheduled_at": "2026-03-10T10:00:00Z",
        "reason": "Agent was busy",
    },
}


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.post("", response_model=NotificationRuleResponse, summary="Create notification rule")
async def create_notification_rule(
    body: CreateNotificationRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new notification rule."""
    try:
        if body.trigger_event not in VALID_TRIGGER_EVENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid trigger_event. Must be one of: {', '.join(sorted(VALID_TRIGGER_EVENTS))}",
            )

        # Validate conditions
        for cond in body.conditions:
            if cond.operator not in VALID_OPERATORS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid operator '{cond.operator}'. Must be one of: {', '.join(sorted(VALID_OPERATORS))}",
                )

        # Validate actions
        for action in body.actions:
            if action.type not in VALID_ACTION_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid action type '{action.type}'. Must be one of: {', '.join(sorted(VALID_ACTION_TYPES))}",
                )

        conditions_json = [c.model_dump() for c in body.conditions]
        actions_json = [a.model_dump() for a in body.actions]

        row = await execute_one(
            """INSERT INTO notification_rules
                   (user_id, name, description, trigger_event, conditions, actions, cooldown_minutes)
               VALUES
                   (:user_id, :name, :description, :trigger_event, :conditions, :actions, :cooldown_minutes)
               RETURNING *""",
            {
                "user_id": user_id,
                "name": body.name,
                "description": body.description,
                "trigger_event": body.trigger_event,
                "conditions": json.dumps(conditions_json),
                "actions": json.dumps(actions_json),
                "cooldown_minutes": body.cooldown_minutes,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create notification rule")

        return _row_to_rule(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating notification rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create notification rule")


@router.get("", response_model=List[NotificationRuleResponse], summary="List notification rules")
async def list_notification_rules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all notification rules for the authenticated user."""
    try:
        rows = await execute(
            """SELECT * FROM notification_rules
               WHERE user_id::text = :user_id
               ORDER BY created_at DESC""",
            {"user_id": user_id},
        )

        return [_row_to_rule(r) for r in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing notification rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to list notification rules")


@router.get("/log", response_model=RuleLogListResponse, summary="List rule execution log")
async def list_notification_rule_log(
    rule_id: Optional[str] = Query(None, description="Filter by rule ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List notification rule execution log entries."""
    try:
        where_parts = ["l.user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if rule_id:
            where_parts.append("l.rule_id::text = :rule_id")
            params["rule_id"] = rule_id

        where_sql = " AND ".join(where_parts)

        count_row = await execute_one(
            f"SELECT COUNT(*) AS cnt FROM notification_rule_log l WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            f"""SELECT l.* FROM notification_rule_log l
                WHERE {where_sql}
                ORDER BY l.created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        logs = [_row_to_log(r) for r in (rows or [])]
        return RuleLogListResponse(logs=logs, total=total)

    except Exception as e:
        logger.error(f"Error listing notification rule log: {e}")
        raise HTTPException(status_code=500, detail="Failed to list rule log")


@router.get("/{rule_id}", response_model=NotificationRuleDetailResponse, summary="Get notification rule detail")
async def get_notification_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a notification rule with recent log entries."""
    try:
        row = await execute_one(
            "SELECT * FROM notification_rules WHERE id = :id AND user_id::text = :user_id",
            {"id": rule_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Notification rule not found")

        rule = _row_to_rule(row)

        # Get recent logs
        log_rows = await execute(
            """SELECT * FROM notification_rule_log
               WHERE rule_id::text = :rule_id AND user_id::text = :user_id
               ORDER BY created_at DESC
               LIMIT 20""",
            {"rule_id": rule_id, "user_id": user_id},
        )

        recent_logs = []
        for lr in (log_rows or []):
            log_entry = _row_to_log(lr)
            recent_logs.append(log_entry.model_dump())

        return NotificationRuleDetailResponse(
            **rule.model_dump(),
            recent_logs=recent_logs,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting notification rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get notification rule")


@router.patch("/{rule_id}", response_model=NotificationRuleResponse, summary="Update notification rule")
async def update_notification_rule(
    rule_id: str,
    body: UpdateNotificationRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a notification rule."""
    try:
        existing = await execute_one(
            "SELECT id FROM notification_rules WHERE id = :id AND user_id::text = :user_id",
            {"id": rule_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Notification rule not found")

        set_parts = ["updated_at = now()"]
        params: Dict[str, Any] = {"id": rule_id, "user_id": user_id}

        if body.name is not None:
            set_parts.append("name = :name")
            params["name"] = body.name
        if body.description is not None:
            set_parts.append("description = :description")
            params["description"] = body.description
        if body.trigger_event is not None:
            if body.trigger_event not in VALID_TRIGGER_EVENTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid trigger_event. Must be one of: {', '.join(sorted(VALID_TRIGGER_EVENTS))}",
                )
            set_parts.append("trigger_event = :trigger_event")
            params["trigger_event"] = body.trigger_event
        if body.conditions is not None:
            for cond in body.conditions:
                if cond.operator not in VALID_OPERATORS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid operator '{cond.operator}'.",
                    )
            set_parts.append("conditions = :conditions")
            params["conditions"] = json.dumps([c.model_dump() for c in body.conditions])
        if body.actions is not None:
            for action in body.actions:
                if action.type not in VALID_ACTION_TYPES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid action type '{action.type}'.",
                    )
            set_parts.append("actions = :actions")
            params["actions"] = json.dumps([a.model_dump() for a in body.actions])
        if body.is_active is not None:
            set_parts.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.cooldown_minutes is not None:
            set_parts.append("cooldown_minutes = :cooldown_minutes")
            params["cooldown_minutes"] = body.cooldown_minutes

        set_sql = ", ".join(set_parts)

        row = await execute_one(
            f"""UPDATE notification_rules SET {set_sql}
                WHERE id = :id AND user_id::text = :user_id
                RETURNING *""",
            params,
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update notification rule")

        return _row_to_rule(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating notification rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notification rule")


@router.delete("/{rule_id}", summary="Delete notification rule")
async def delete_notification_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a notification rule and its log entries."""
    try:
        existing = await execute_one(
            "SELECT id FROM notification_rules WHERE id = :id AND user_id::text = :user_id",
            {"id": rule_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Notification rule not found")

        await execute_mutate(
            "DELETE FROM notification_rules WHERE id = :id AND user_id::text = :user_id",
            {"id": rule_id, "user_id": user_id},
        )

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting notification rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete notification rule")


@router.post("/{rule_id}/test", response_model=TestRuleResult, summary="Test notification rule")
async def test_notification_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Test a notification rule with mock data. Returns what would happen."""
    try:
        row = await execute_one(
            "SELECT * FROM notification_rules WHERE id = :id AND user_id::text = :user_id",
            {"id": rule_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Notification rule not found")

        trigger_event = row["trigger_event"]
        conditions = row.get("conditions") or []
        actions = row.get("actions") or []
        if isinstance(conditions, str):
            conditions = json.loads(conditions)
        if isinstance(actions, str):
            actions = json.loads(actions)

        # Get mock data for this event type
        mock_data = MOCK_EVENT_DATA.get(trigger_event, {})

        # Evaluate conditions
        conditions_evaluated = []
        all_met = True
        for cond in conditions:
            result = _evaluate_condition(cond, mock_data)
            conditions_evaluated.append(result)
            if not result.get("met", False):
                all_met = False

        # If no conditions, all are met by default
        if not conditions:
            all_met = True

        # Check cooldown
        cooldown_active = False
        cooldown_minutes = row.get("cooldown_minutes", 0)
        last_triggered = row.get("last_triggered_at")
        if cooldown_minutes > 0 and last_triggered:
            if hasattr(last_triggered, 'timestamp'):
                elapsed = (datetime.now(timezone.utc) - last_triggered).total_seconds() / 60
                cooldown_active = elapsed < cooldown_minutes

        # Build actions that would fire
        actions_would_fire = []
        if all_met and not cooldown_active:
            for action in actions:
                actions_would_fire.append({
                    "type": action.get("type"),
                    "config": action.get("config", {}),
                    "would_execute": True,
                })

        return TestRuleResult(
            rule_id=str(row["id"]),
            rule_name=row["name"],
            trigger_event=trigger_event,
            conditions_evaluated=conditions_evaluated,
            all_conditions_met=all_met,
            actions_that_would_fire=actions_would_fire,
            cooldown_active=cooldown_active,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing notification rule {rule_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to test notification rule")
