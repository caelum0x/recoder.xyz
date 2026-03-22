"""
Agent Audit Log API endpoints.

Provides event logging, batch ingestion, querying, stats, and retention management
for agent audit events. Access control enforced at application layer (WHERE user_id = :user_id).
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger

router = APIRouter(tags=["agent-audit-log"])


# ============================================================================
# Pydantic Models
# ============================================================================

class LogEventRequest(BaseModel):
    agent_id: Optional[str] = None
    event_type: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    action: str
    actor: Optional[str] = "user"
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BatchLogEventsRequest(BaseModel):
    events: List[LogEventRequest]


class UpdateRetentionRequest(BaseModel):
    retention_days: int = Field(..., ge=1, le=3650)
    export_before_delete: Optional[bool] = False


# ============================================================================
# Endpoints — placed in order: stats/retention/cleanup before /{event_id}
# ============================================================================

@router.post(
    "/audit/events",
    summary="Log audit event",
    operation_id="log_audit_event",
)
async def log_audit_event(
    body: LogEventRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Log a single audit event."""
    import json

    row = await execute_one(
        """
        INSERT INTO agent_audit_events
          (user_id, agent_id, event_type, resource_type, resource_id, action, actor,
           old_values, new_values, ip_address, user_agent, metadata)
        VALUES
          (:user_id, :agent_id, :event_type, :resource_type, :resource_id, :action, :actor,
           :old_values::jsonb, :new_values::jsonb, :ip_address, :user_agent, :metadata::jsonb)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": body.agent_id,
            "event_type": body.event_type,
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "action": body.action,
            "actor": body.actor or "user",
            "old_values": json.dumps(body.old_values or {}),
            "new_values": json.dumps(body.new_values or {}),
            "ip_address": body.ip_address,
            "user_agent": body.user_agent,
            "metadata": json.dumps(body.metadata or {}),
        },
    )
    return serialize_row(row)


@router.post(
    "/audit/events/batch",
    summary="Batch log audit events",
    operation_id="batch_log_audit_events",
)
async def batch_log_audit_events(
    body: BatchLogEventsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Log multiple audit events in a single request."""
    import json

    if not body.events:
        return {"inserted": 0, "events": []}

    inserted = []
    for evt in body.events:
        row = await execute_one(
            """
            INSERT INTO agent_audit_events
              (user_id, agent_id, event_type, resource_type, resource_id, action, actor,
               old_values, new_values, ip_address, user_agent, metadata)
            VALUES
              (:user_id, :agent_id, :event_type, :resource_type, :resource_id, :action, :actor,
               :old_values::jsonb, :new_values::jsonb, :ip_address, :user_agent, :metadata::jsonb)
            RETURNING id, event_type, action, created_at
            """,
            {
                "user_id": user_id,
                "agent_id": evt.agent_id,
                "event_type": evt.event_type,
                "resource_type": evt.resource_type,
                "resource_id": evt.resource_id,
                "action": evt.action,
                "actor": evt.actor or "user",
                "old_values": json.dumps(evt.old_values or {}),
                "new_values": json.dumps(evt.new_values or {}),
                "ip_address": evt.ip_address,
                "user_agent": evt.user_agent,
                "metadata": json.dumps(evt.metadata or {}),
            },
        )
        inserted.append(serialize_row(row))

    return {"inserted": len(inserted), "events": inserted}


@router.get(
    "/audit/events/stats",
    summary="Get audit event stats",
    operation_id="get_audit_event_stats",
)
async def get_audit_event_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats for audit events."""
    total_row = await execute_one(
        "SELECT COUNT(*) AS total FROM agent_audit_events WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    total_events = int(total_row["total"]) if total_row else 0

    type_rows = await execute(
        "SELECT event_type, COUNT(*) AS cnt FROM agent_audit_events WHERE user_id = :user_id GROUP BY event_type ORDER BY cnt DESC",
        {"user_id": user_id},
    )
    by_event_type = {row["event_type"]: int(row["cnt"]) for row in (type_rows or [])}

    agent_rows = await execute(
        """
        SELECT agent_id, COUNT(*) AS cnt
        FROM agent_audit_events
        WHERE user_id = :user_id AND agent_id IS NOT NULL
        GROUP BY agent_id ORDER BY cnt DESC LIMIT 20
        """,
        {"user_id": user_id},
    )
    by_agent = {row["agent_id"]: int(row["cnt"]) for row in (agent_rows or [])}

    action_rows = await execute(
        "SELECT action, COUNT(*) AS cnt FROM agent_audit_events WHERE user_id = :user_id GROUP BY action ORDER BY cnt DESC",
        {"user_id": user_id},
    )
    by_action = {row["action"]: int(row["cnt"]) for row in (action_rows or [])}

    daily_rows = await execute(
        """
        SELECT DATE(created_at) AS day, COUNT(*) AS cnt
        FROM agent_audit_events
        WHERE user_id = :user_id AND created_at >= now() - INTERVAL '7 days'
        GROUP BY day ORDER BY day ASC
        """,
        {"user_id": user_id},
    )
    events_per_day = [
        {"date": str(row["day"]), "count": int(row["cnt"])} for row in (daily_rows or [])
    ]

    return {
        "total_events": total_events,
        "by_event_type": by_event_type,
        "by_agent": by_agent,
        "by_action": by_action,
        "events_per_day": events_per_day,
    }


@router.get(
    "/audit/retention",
    summary="Get audit retention policy",
    operation_id="get_audit_retention_policy",
)
async def get_audit_retention_policy(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the retention policy for the authenticated user, or defaults."""
    row = await execute_one(
        "SELECT * FROM audit_retention_policies WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    if not row:
        return {"retention_days": 90, "export_before_delete": False}
    return serialize_row(row)


@router.put(
    "/audit/retention",
    summary="Upsert audit retention policy",
    operation_id="update_audit_retention_policy",
)
async def update_audit_retention_policy(
    body: UpdateRetentionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or update the audit retention policy for the authenticated user."""
    row = await execute_one(
        """
        INSERT INTO audit_retention_policies (user_id, retention_days, export_before_delete)
        VALUES (:user_id, :retention_days, :export_before_delete)
        ON CONFLICT (user_id) DO UPDATE
          SET retention_days = EXCLUDED.retention_days,
              export_before_delete = EXCLUDED.export_before_delete
        RETURNING *
        """,
        {
            "user_id": user_id,
            "retention_days": body.retention_days,
            "export_before_delete": body.export_before_delete if body.export_before_delete is not None else False,
        },
    )
    return serialize_row(row)


@router.delete(
    "/audit/events/cleanup",
    summary="Clean up old audit events",
    operation_id="cleanup_audit_events",
)
async def cleanup_audit_events(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete audit events older than the user's retention policy."""
    policy = await execute_one(
        "SELECT retention_days FROM audit_retention_policies WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    days = int(policy["retention_days"]) if policy else 90

    result = await execute_mutate(
        f"DELETE FROM agent_audit_events WHERE user_id = :user_id AND created_at < now() - INTERVAL '{days} days'",
        {"user_id": user_id},
    )
    deleted_count = len(result) if isinstance(result, list) else 0
    return {"deleted_count": deleted_count}


@router.get(
    "/audit/events",
    summary="Query audit events",
    operation_id="query_audit_events",
)
async def query_audit_events(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, description="ISO datetime string"),
    to_date: Optional[str] = Query(None, description="ISO datetime string"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Query audit events with filters, pagination."""
    conditions = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

    if agent_id:
        conditions.append("agent_id = :agent_id")
        params["agent_id"] = agent_id
    if event_type:
        conditions.append("event_type = :event_type")
        params["event_type"] = event_type
    if resource_type:
        conditions.append("resource_type = :resource_type")
        params["resource_type"] = resource_type
    if action:
        conditions.append("action = :action")
        params["action"] = action
    if from_date:
        conditions.append("created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("created_at <= :to_date")
        params["to_date"] = to_date

    where = " AND ".join(conditions)
    rows = await execute(
        f"SELECT * FROM agent_audit_events WHERE {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset",
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/audit/events/{event_id}",
    summary="Get audit event detail",
    operation_id="get_audit_event",
)
async def get_audit_event(
    event_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single audit event by ID."""
    row = await execute_one(
        "SELECT * FROM agent_audit_events WHERE id = :id AND user_id = :user_id",
        {"id": event_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Audit event not found")
    return serialize_row(row)
