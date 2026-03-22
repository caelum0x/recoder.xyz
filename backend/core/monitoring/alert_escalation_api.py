"""
Alert Escalation API endpoints.

Provides CRUD for escalation policies and incident lifecycle management
(open -> acknowledged -> escalated -> resolved/closed) with action timeline.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger

router = APIRouter(tags=["alert-escalation"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreatePolicyRequest(BaseModel):
    policy_name: str
    description: Optional[str] = None
    escalation_steps: List[Dict[str, Any]] = Field(default_factory=list)
    repeat_interval_minutes: Optional[int] = 0
    is_active: Optional[bool] = True


class UpdatePolicyRequest(BaseModel):
    policy_name: Optional[str] = None
    description: Optional[str] = None
    escalation_steps: Optional[List[Dict[str, Any]]] = None
    repeat_interval_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class CreateIncidentRequest(BaseModel):
    title: str
    severity: Optional[str] = "medium"
    policy_id: Optional[str] = None
    source: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class EscalateIncidentRequest(BaseModel):
    notes: Optional[str] = None


class ResolveIncidentRequest(BaseModel):
    notes: Optional[str] = None


# ============================================================================
# Endpoints — Policies
# ============================================================================

@router.post(
    "/escalation/policies",
    summary="Create escalation policy",
    operation_id="create_escalation_policy",
)
async def create_escalation_policy(
    body: CreatePolicyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new escalation policy for the authenticated user."""
    import json

    valid_steps = body.escalation_steps if body.escalation_steps is not None else []
    try:
        row = await execute_one(
            """
            INSERT INTO escalation_policies
              (user_id, policy_name, description, escalation_steps, repeat_interval_minutes, is_active)
            VALUES
              (:user_id, :policy_name, :description, :escalation_steps::jsonb, :repeat_interval_minutes, :is_active)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "policy_name": body.policy_name,
                "description": body.description,
                "escalation_steps": json.dumps(valid_steps),
                "repeat_interval_minutes": body.repeat_interval_minutes or 0,
                "is_active": body.is_active if body.is_active is not None else True,
            },
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Policy name already exists")
        logger.error(f"create_escalation_policy error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create policy")

    return serialize_row(row)


@router.get(
    "/escalation/policies",
    summary="List escalation policies",
    operation_id="list_escalation_policies",
)
async def list_escalation_policies(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all escalation policies for the authenticated user."""
    rows = await execute(
        "SELECT * FROM escalation_policies WHERE user_id = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.patch(
    "/escalation/policies/{policy_id}",
    summary="Update escalation policy",
    operation_id="update_escalation_policy",
)
async def update_escalation_policy(
    policy_id: str,
    body: UpdatePolicyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an escalation policy owned by the authenticated user."""
    import json

    existing = await execute_one(
        "SELECT id FROM escalation_policies WHERE id = :id AND user_id = :user_id",
        {"id": policy_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")

    updates: Dict[str, Any] = {}
    if body.policy_name is not None:
        updates["policy_name"] = body.policy_name
    if body.description is not None:
        updates["description"] = body.description
    if body.escalation_steps is not None:
        updates["escalation_steps"] = json.dumps(body.escalation_steps)
    if body.repeat_interval_minutes is not None:
        updates["repeat_interval_minutes"] = body.repeat_interval_minutes
    if body.is_active is not None:
        updates["is_active"] = body.is_active

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params: Dict[str, Any] = {"id": policy_id, "user_id": user_id}
    for key, val in updates.items():
        if key == "escalation_steps":
            set_clauses.append(f"{key} = :{key}::jsonb")
        else:
            set_clauses.append(f"{key} = :{key}")
        params[key] = val

    row = await execute_one(
        f"UPDATE escalation_policies SET {', '.join(set_clauses)} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    return serialize_row(row)


@router.delete(
    "/escalation/policies/{policy_id}",
    summary="Delete escalation policy",
    operation_id="delete_escalation_policy",
)
async def delete_escalation_policy(
    policy_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an escalation policy owned by the authenticated user."""
    existing = await execute_one(
        "SELECT id FROM escalation_policies WHERE id = :id AND user_id = :user_id",
        {"id": policy_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")

    await execute_mutate(
        "DELETE FROM escalation_policies WHERE id = :id AND user_id = :user_id",
        {"id": policy_id, "user_id": user_id},
    )
    return {"deleted": True}


# ============================================================================
# Endpoints — Incidents
# ============================================================================

@router.post(
    "/escalation/incidents",
    summary="Create escalation incident",
    operation_id="create_escalation_incident",
)
async def create_escalation_incident(
    body: CreateIncidentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new escalation incident."""
    import json

    valid_severities = {"low", "medium", "high", "critical"}
    severity = body.severity or "medium"
    if severity not in valid_severities:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: {', '.join(valid_severities)}")

    row = await execute_one(
        """
        INSERT INTO escalation_incidents
          (user_id, policy_id, title, severity, source, details)
        VALUES
          (:user_id, :policy_id, :title, :severity, :source, :details::jsonb)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "policy_id": body.policy_id,
            "title": body.title,
            "severity": severity,
            "source": body.source,
            "details": json.dumps(body.details or {}),
        },
    )
    return serialize_row(row)


@router.get(
    "/escalation/incidents",
    summary="List escalation incidents",
    operation_id="list_escalation_incidents",
)
async def list_escalation_incidents(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List escalation incidents for the authenticated user."""
    conditions = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

    if status:
        conditions.append("status = :status")
        params["status"] = status
    if severity:
        conditions.append("severity = :severity")
        params["severity"] = severity

    where = " AND ".join(conditions)
    rows = await execute(
        f"SELECT * FROM escalation_incidents WHERE {where} ORDER BY created_at DESC LIMIT :limit",
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/escalation/incidents/{incident_id}",
    summary="Get escalation incident with actions",
    operation_id="get_escalation_incident",
)
async def get_escalation_incident(
    incident_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single escalation incident with its action timeline."""
    incident = await execute_one(
        "SELECT * FROM escalation_incidents WHERE id = :id AND user_id = :user_id",
        {"id": incident_id, "user_id": user_id},
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    actions = await execute(
        "SELECT * FROM escalation_actions WHERE incident_id = :incident_id ORDER BY performed_at ASC",
        {"incident_id": incident_id},
    )

    result = serialize_row(incident)
    result["actions"] = serialize_rows(actions)
    return result


@router.post(
    "/escalation/incidents/{incident_id}/acknowledge",
    summary="Acknowledge escalation incident",
    operation_id="acknowledge_escalation_incident",
)
async def acknowledge_escalation_incident(
    incident_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Acknowledge an open incident."""
    incident = await execute_one(
        "SELECT id, status FROM escalation_incidents WHERE id = :id AND user_id = :user_id",
        {"id": incident_id, "user_id": user_id},
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.now(timezone.utc).isoformat()
    row = await execute_one(
        """
        UPDATE escalation_incidents
        SET status = 'acknowledged', acknowledged_at = :now
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": incident_id, "user_id": user_id, "now": now},
    )

    await execute_mutate(
        """
        INSERT INTO escalation_actions (incident_id, user_id, action_type, step_index)
        VALUES (:incident_id, :user_id, 'acknowledge', 0)
        """,
        {"incident_id": incident_id, "user_id": user_id},
    )

    return serialize_row(row)


@router.post(
    "/escalation/incidents/{incident_id}/escalate",
    summary="Escalate incident to next step",
    operation_id="escalate_incident",
)
async def escalate_incident(
    incident_id: str,
    body: EscalateIncidentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Escalate an incident to the next step."""
    incident = await execute_one(
        "SELECT id, current_step FROM escalation_incidents WHERE id = :id AND user_id = :user_id",
        {"id": incident_id, "user_id": user_id},
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    next_step = (incident["current_step"] or 0) + 1
    row = await execute_one(
        """
        UPDATE escalation_incidents
        SET status = 'escalated', current_step = :next_step
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": incident_id, "user_id": user_id, "next_step": next_step},
    )

    await execute_mutate(
        """
        INSERT INTO escalation_actions (incident_id, user_id, action_type, step_index, notes)
        VALUES (:incident_id, :user_id, 'escalate', :step_index, :notes)
        """,
        {"incident_id": incident_id, "user_id": user_id, "step_index": next_step, "notes": body.notes},
    )

    return serialize_row(row)


@router.post(
    "/escalation/incidents/{incident_id}/resolve",
    summary="Resolve escalation incident",
    operation_id="resolve_escalation_incident",
)
async def resolve_escalation_incident(
    incident_id: str,
    body: ResolveIncidentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Resolve an incident."""
    incident = await execute_one(
        "SELECT id FROM escalation_incidents WHERE id = :id AND user_id = :user_id",
        {"id": incident_id, "user_id": user_id},
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.now(timezone.utc).isoformat()
    row = await execute_one(
        """
        UPDATE escalation_incidents
        SET status = 'resolved', resolved_at = :now
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": incident_id, "user_id": user_id, "now": now},
    )

    await execute_mutate(
        """
        INSERT INTO escalation_actions (incident_id, user_id, action_type, step_index, notes)
        VALUES (:incident_id, :user_id, 'resolve', 0, :notes)
        """,
        {"incident_id": incident_id, "user_id": user_id, "notes": body.notes},
    )

    return serialize_row(row)


# ============================================================================
# Endpoints — Stats
# ============================================================================

@router.get(
    "/escalation/stats",
    summary="Get escalation stats",
    operation_id="get_escalation_stats",
)
async def get_escalation_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate escalation statistics for the authenticated user."""
    open_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM escalation_incidents WHERE user_id = :user_id AND status NOT IN ('resolved', 'closed')",
        {"user_id": user_id},
    )
    open_count = int(open_row["cnt"]) if open_row else 0

    severity_rows = await execute(
        """
        SELECT severity, COUNT(*) AS cnt
        FROM escalation_incidents
        WHERE user_id = :user_id AND status NOT IN ('resolved', 'closed')
        GROUP BY severity
        """,
        {"user_id": user_id},
    )
    by_severity = {row["severity"]: int(row["cnt"]) for row in (severity_rows or [])}

    avg_row = await execute_one(
        """
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0) AS avg_mins
        FROM escalation_incidents
        WHERE user_id = :user_id AND status = 'resolved' AND resolved_at IS NOT NULL
        """,
        {"user_id": user_id},
    )
    avg_resolution_minutes = round(float(avg_row["avg_mins"]), 2) if avg_row and avg_row["avg_mins"] else None

    total_row = await execute_one(
        "SELECT COUNT(*) AS total FROM escalation_incidents WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    escalated_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM escalation_incidents WHERE user_id = :user_id AND status = 'escalated'",
        {"user_id": user_id},
    )
    total = int(total_row["total"]) if total_row else 0
    escalated = int(escalated_row["cnt"]) if escalated_row else 0
    escalation_rate = round(escalated / total, 4) if total > 0 else 0.0

    return {
        "open_count": open_count,
        "by_severity": by_severity,
        "avg_resolution_minutes": avg_resolution_minutes,
        "escalation_rate": escalation_rate,
    }
