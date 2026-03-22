"""
Quota Alert Rules & Events API endpoints.

Provides CRUD for alert rules, threshold evaluation, event history, and stats.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["quota-alerts"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateAlertRuleRequest(BaseModel):
    rule_name: str
    metric_type: str
    agent_id: Optional[str] = None
    threshold_value: float
    threshold_type: str = "absolute"
    comparison: str = "gte"
    alert_channel: str = "in_app"
    webhook_url: Optional[str] = None
    cooldown_minutes: int = Field(default=60, ge=1)


class UpdateAlertRuleRequest(BaseModel):
    rule_name: Optional[str] = None
    metric_type: Optional[str] = None
    agent_id: Optional[str] = None
    threshold_value: Optional[float] = None
    threshold_type: Optional[str] = None
    comparison: Optional[str] = None
    alert_channel: Optional[str] = None
    webhook_url: Optional[str] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None


class CheckQuotaRequest(BaseModel):
    metric_type: str
    metric_value: float
    agent_id: Optional[str] = None


# ============================================================================
# Helper
# ============================================================================

def _compare(metric_value: float, threshold: float, comparison: str) -> bool:
    if comparison == "gte":
        return metric_value >= threshold
    if comparison == "lte":
        return metric_value <= threshold
    if comparison == "gt":
        return metric_value > threshold
    if comparison == "lt":
        return metric_value < threshold
    return False


# ============================================================================
# Endpoints — Rules
# ============================================================================

@router.post(
    "/quota/rules",
    summary="Create an alert rule",
    operation_id="create_quota_alert_rule",
)
async def create_alert_rule(
    body: CreateAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new quota alert rule for the authenticated user."""
    valid_metric_types = ("api_calls", "tokens", "cost_usd", "storage_mb", "agents_count", "threads_count")
    if body.metric_type not in valid_metric_types:
        raise HTTPException(status_code=400, detail=f"metric_type must be one of {valid_metric_types}")

    valid_comparisons = ("gte", "lte", "gt", "lt")
    if body.comparison not in valid_comparisons:
        raise HTTPException(status_code=400, detail=f"comparison must be one of {valid_comparisons}")

    valid_channels = ("in_app", "email", "webhook")
    if body.alert_channel not in valid_channels:
        raise HTTPException(status_code=400, detail=f"alert_channel must be one of {valid_channels}")

    rule_id = str(uuid.uuid4())
    try:
        await execute_mutate(
            """
            INSERT INTO quota_alert_rules
              (id, user_id, rule_name, metric_type, agent_id, threshold_value,
               threshold_type, comparison, alert_channel, webhook_url, cooldown_minutes)
            VALUES
              (:id, :user_id, :rule_name, :metric_type, :agent_id, :threshold_value,
               :threshold_type, :comparison, :alert_channel, :webhook_url, :cooldown_minutes)
            """,
            {
                "id": rule_id,
                "user_id": user_id,
                "rule_name": body.rule_name,
                "metric_type": body.metric_type,
                "agent_id": body.agent_id,
                "threshold_value": body.threshold_value,
                "threshold_type": body.threshold_type,
                "comparison": body.comparison,
                "alert_channel": body.alert_channel,
                "webhook_url": body.webhook_url,
                "cooldown_minutes": body.cooldown_minutes,
            },
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="A rule with that name already exists")
        logger.error(f"create_alert_rule error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create alert rule")

    row = await execute_one(
        "SELECT * FROM quota_alert_rules WHERE id = :id",
        {"id": rule_id},
    )
    return serialize_row(row)


@router.get(
    "/quota/rules",
    summary="List alert rules",
    operation_id="list_quota_alert_rules",
)
async def list_alert_rules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all alert rules for the authenticated user."""
    rows = await execute(
        "SELECT * FROM quota_alert_rules WHERE user_id = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.patch(
    "/quota/rules/{rule_id}",
    summary="Update an alert rule",
    operation_id="update_quota_alert_rule",
)
async def update_alert_rule(
    rule_id: str,
    body: UpdateAlertRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update fields on an existing alert rule."""
    existing = await execute_one(
        "SELECT id FROM quota_alert_rules WHERE id = :id AND user_id = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        row = await execute_one("SELECT * FROM quota_alert_rules WHERE id = :id", {"id": rule_id})
        return serialize_row(row)

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "id": rule_id, "user_id": user_id}
    await execute_mutate(
        f"UPDATE quota_alert_rules SET {set_clauses} WHERE id = :id AND user_id = :user_id",
        params,
    )
    row = await execute_one("SELECT * FROM quota_alert_rules WHERE id = :id", {"id": rule_id})
    return serialize_row(row)


@router.delete(
    "/quota/rules/{rule_id}",
    summary="Delete an alert rule",
    operation_id="delete_quota_alert_rule",
)
async def delete_alert_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an alert rule (cascades to events)."""
    existing = await execute_one(
        "SELECT id FROM quota_alert_rules WHERE id = :id AND user_id = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    await execute_mutate(
        "DELETE FROM quota_alert_rules WHERE id = :id AND user_id = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    return {"deleted": True, "rule_id": rule_id}


# ============================================================================
# Endpoint — Check (evaluate rules)
# ============================================================================

@router.post(
    "/quota/check",
    summary="Evaluate quota rules",
    operation_id="check_quota",
)
async def check_quota(
    body: CheckQuotaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Evaluate active rules for the given metric. For matching rules that have
    cooled down, insert an event and update trigger stats.
    """
    rows = await execute(
        """
        SELECT * FROM quota_alert_rules
        WHERE user_id = :user_id
          AND metric_type = :metric_type
          AND is_active = true
          AND (agent_id IS NULL OR agent_id = :agent_id)
        """,
        {"user_id": user_id, "metric_type": body.metric_type, "agent_id": body.agent_id},
    )
    rules = serialize_rows(rows)

    now = datetime.now(timezone.utc)
    triggered_events: List[Any] = []

    for rule in rules:
        triggered = _compare(body.metric_value, float(rule["threshold_value"]), rule["comparison"])
        if not triggered:
            continue

        # Cooldown check
        last_triggered = rule.get("last_triggered_at")
        cooldown_minutes = rule.get("cooldown_minutes", 60) or 60
        if last_triggered:
            if isinstance(last_triggered, str):
                last_triggered = datetime.fromisoformat(last_triggered.replace("Z", "+00:00"))
            elapsed = (now - last_triggered).total_seconds() / 60
            if elapsed < cooldown_minutes:
                continue

        # Insert event
        event_id = str(uuid.uuid4())
        message = (
            f"Metric '{rule['metric_type']}' value {body.metric_value} "
            f"{rule['comparison']} threshold {rule['threshold_value']} for rule '{rule['rule_name']}'"
        )
        await execute_mutate(
            """
            INSERT INTO quota_alert_events
              (id, rule_id, user_id, metric_value, threshold_value, message)
            VALUES
              (:id, :rule_id, :user_id, :metric_value, :threshold_value, :message)
            """,
            {
                "id": event_id,
                "rule_id": rule["id"],
                "user_id": user_id,
                "metric_value": body.metric_value,
                "threshold_value": float(rule["threshold_value"]),
                "message": message,
            },
        )

        # Update rule stats
        await execute_mutate(
            """
            UPDATE quota_alert_rules
            SET last_triggered_at = :now, trigger_count = trigger_count + 1
            WHERE id = :id
            """,
            {"now": now.isoformat(), "id": rule["id"]},
        )

        event_row = await execute_one(
            "SELECT * FROM quota_alert_events WHERE id = :id", {"id": event_id}
        )
        triggered_events.append(serialize_row(event_row))

    return {"triggered_count": len(triggered_events), "events": triggered_events}


# ============================================================================
# Endpoints — Events
# ============================================================================

@router.post(
    "/quota/events/read-all",
    summary="Mark all events as read",
    operation_id="mark_all_quota_events_read",
)
async def mark_all_events_read(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark all unread quota alert events for the user as read."""
    await execute_mutate(
        "UPDATE quota_alert_events SET is_read = true WHERE user_id = :user_id AND is_read = false",
        {"user_id": user_id},
    )
    return {"marked_read": True}


@router.post(
    "/quota/events/{event_id}/read",
    summary="Mark an event as read",
    operation_id="mark_quota_event_read",
)
async def mark_event_read(
    event_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a single quota alert event as read."""
    existing = await execute_one(
        "SELECT id FROM quota_alert_events WHERE id = :id AND user_id = :user_id",
        {"id": event_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    await execute_mutate(
        "UPDATE quota_alert_events SET is_read = true WHERE id = :id AND user_id = :user_id",
        {"id": event_id, "user_id": user_id},
    )
    return {"marked_read": True, "event_id": event_id}


@router.get(
    "/quota/events",
    summary="List alert events",
    operation_id="list_quota_alert_events",
)
async def list_alert_events(
    unread_only: bool = Query(default=False),
    rule_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List quota alert events with optional filters."""
    conditions = ["user_id = :user_id"]
    params: dict = {"user_id": user_id, "limit": limit}

    if unread_only:
        conditions.append("is_read = false")
    if rule_id:
        conditions.append("rule_id = :rule_id")
        params["rule_id"] = rule_id

    where_clause = " AND ".join(conditions)
    rows = await execute(
        f"SELECT * FROM quota_alert_events WHERE {where_clause} ORDER BY triggered_at DESC LIMIT :limit",
        params,
    )
    return serialize_rows(rows)


# ============================================================================
# Endpoint — Stats
# ============================================================================

@router.get(
    "/quota/stats",
    summary="Quota alert statistics",
    operation_id="get_quota_alert_stats",
)
async def get_quota_alert_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats: active rules, unread events, top rule, events by metric."""
    active_rules_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM quota_alert_rules WHERE user_id = :user_id AND is_active = true",
        {"user_id": user_id},
    )
    active_rules_count = int(active_rules_row["cnt"]) if active_rules_row else 0

    unread_events_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM quota_alert_events WHERE user_id = :user_id AND is_read = false",
        {"user_id": user_id},
    )
    unread_events_count = int(unread_events_row["cnt"]) if unread_events_row else 0

    top_rule_row = await execute_one(
        """
        SELECT rule_name FROM quota_alert_rules
        WHERE user_id = :user_id
        ORDER BY trigger_count DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    most_triggered_rule = top_rule_row["rule_name"] if top_rule_row else None

    metric_rows = await execute(
        """
        SELECT r.metric_type, COUNT(e.id) AS event_count
        FROM quota_alert_events e
        JOIN quota_alert_rules r ON r.id = e.rule_id
        WHERE e.user_id = :user_id
        GROUP BY r.metric_type
        ORDER BY event_count DESC
        """,
        {"user_id": user_id},
    )
    events_by_metric = {row["metric_type"]: int(row["event_count"]) for row in (metric_rows or [])}

    return {
        "active_rules_count": active_rules_count,
        "unread_events_count": unread_events_count,
        "most_triggered_rule": most_triggered_rule,
        "events_by_metric": events_by_metric,
    }
