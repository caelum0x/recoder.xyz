"""
Audit Log API endpoints.

Provides listing, recording, summary, export, and timeline views of audit events.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["audit-log"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateAuditLogRequest(BaseModel):
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/audit/logs",
    summary="List audit logs",
    operation_id="list_audit_logs",
)
async def list_audit_logs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="ISO date string"),
    date_to: Optional[str] = Query(None, description="ISO date string"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List audit logs for the authenticated user with optional filters."""
    where_clauses = ["user_id = :user_id"]
    params: Dict[str, Any] = {
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }

    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type

    if action:
        where_clauses.append("action ILIKE :action")
        params["action"] = f"%{action}%"

    if resource_id:
        where_clauses.append("resource_id = :resource_id")
        params["resource_id"] = resource_id

    if date_from:
        where_clauses.append("created_at >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("created_at <= :date_to")
        params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    rows = await execute(
        f"""
        SELECT * FROM audit_log
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    count_row = await execute_one(
        f"SELECT COUNT(*) FROM audit_log WHERE {where_sql}",
        count_params,
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "logs": serialize_rows(rows),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post(
    "/audit/logs",
    summary="Record audit event",
    operation_id="create_audit_log",
)
async def create_audit_log(
    body: CreateAuditLogRequest,
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record an audit event for the authenticated user."""
    valid_resource_types = (
        "agent", "thread", "webhook", "api_key", "team",
        "billing", "settings", "deployment", "integration",
    )
    if body.resource_type not in valid_resource_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid resource_type. Must be one of: {', '.join(valid_resource_types)}",
        )

    # Auto-detect IP and User-Agent if not provided
    ip_address = body.ip_address or (request.client.host if request.client else None)
    user_agent_str = body.user_agent or request.headers.get("user-agent")

    row = await execute_one(
        """
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES (:user_id, :action, :resource_type, :resource_id, :details, :ip_address, :user_agent)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "action": body.action,
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "details": body.details or {},
            "ip_address": ip_address,
            "user_agent": user_agent_str,
        },
        commit=True,
    )

    return row


@router.get(
    "/audit/logs/summary",
    summary="Audit log summary",
    operation_id="audit_log_summary",
)
async def audit_log_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(7, ge=1, le=90),
):
    """
    Summary of audit events: events per resource type, most active hours,
    and top 5 actions.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Events per resource type
    resource_rows = await execute(
        """
        SELECT resource_type, COUNT(*) AS count
        FROM audit_log
        WHERE user_id = :user_id AND created_at >= :since
        GROUP BY resource_type
        ORDER BY count DESC
        """,
        {"user_id": user_id, "since": since},
    )

    # Most active hours
    hour_rows = await execute(
        """
        SELECT EXTRACT(HOUR FROM created_at)::INTEGER AS hour, COUNT(*) AS count
        FROM audit_log
        WHERE user_id = :user_id AND created_at >= :since
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 5
        """,
        {"user_id": user_id, "since": since},
    )

    # Top 5 actions
    action_rows = await execute(
        """
        SELECT action, COUNT(*) AS count
        FROM audit_log
        WHERE user_id = :user_id AND created_at >= :since
        GROUP BY action
        ORDER BY count DESC
        LIMIT 5
        """,
        {"user_id": user_id, "since": since},
    )

    # Total events
    total_row = await execute_one(
        """
        SELECT COUNT(*) FROM audit_log
        WHERE user_id = :user_id AND created_at >= :since
        """,
        {"user_id": user_id, "since": since},
    )
    total_events = int(total_row["count"]) if total_row else 0

    return {
        "total_events": total_events,
        "days": days,
        "events_by_resource": serialize_rows(resource_rows),
        "most_active_hours": serialize_rows(hour_rows),
        "top_actions": serialize_rows(action_rows),
    }


@router.get(
    "/audit/logs/export",
    summary="Export audit logs",
    operation_id="export_audit_logs",
)
async def export_audit_logs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Export audit logs as a JSON array with the same filters as list endpoint."""
    where_clauses = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id}

    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type

    if action:
        where_clauses.append("action ILIKE :action")
        params["action"] = f"%{action}%"

    if resource_id:
        where_clauses.append("resource_id = :resource_id")
        params["resource_id"] = resource_id

    if date_from:
        where_clauses.append("created_at >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("created_at <= :date_to")
        params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    rows = await execute(
        f"""
        SELECT * FROM audit_log
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT 5000
        """,
        params,
    )

    return serialize_rows(rows)


@router.get(
    "/audit/logs/timeline",
    summary="Audit log timeline",
    operation_id="audit_log_timeline",
)
async def audit_log_timeline(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(30, ge=1, le=90),
):
    """Events per day for charting. Returns [{date, count}]."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    rows = await execute(
        """
        SELECT DATE(created_at) AS date, COUNT(*) AS count
        FROM audit_log
        WHERE user_id = :user_id AND created_at >= :since
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        """,
        {"user_id": user_id, "since": since},
    )

    return serialize_rows(rows)
