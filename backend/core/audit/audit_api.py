"""
Sprint 43 Phase 1: Audit Log API

Provides read-only endpoints for querying the audit log table.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from datetime import datetime, timedelta, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute

router = APIRouter(tags=["audit-logs"])


@router.get("/audit/logs", summary="Get audit logs")
async def get_audit_logs(
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    action: Optional[str] = Query(None, description="Filter by action (substring match)"),
    from_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    to_date: Optional[str] = Query(None, description="End date (ISO format)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Retrieve paginated audit logs for the authenticated user.
    Supports filtering by resource_type, action substring, and date range.
    """
    params: dict = {
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }
    query = (
        "SELECT id, user_id, action, resource_type, resource_id, details, "
        "ip_address, user_agent, created_at "
        "FROM audit_logs "
        "WHERE user_id = :user_id"
    )
    if resource_type:
        query += " AND resource_type = :resource_type"
        params["resource_type"] = resource_type
    if action:
        query += " AND action ILIKE :action"
        params["action"] = f"%{action}%"
    if from_date:
        query += " AND created_at >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND created_at <= :to_date"
        params["to_date"] = to_date

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    rows = await execute(query, params)

    # Also get total count for pagination
    count_query = "SELECT COUNT(*) as total FROM audit_logs WHERE user_id = :user_id"
    count_params: dict = {"user_id": user_id}
    if resource_type:
        count_query += " AND resource_type = :resource_type"
        count_params["resource_type"] = resource_type
    if action:
        count_query += " AND action ILIKE :action"
        count_params["action"] = f"%{action}%"
    if from_date:
        count_query += " AND created_at >= :from_date"
        count_params["from_date"] = from_date
    if to_date:
        count_query += " AND created_at <= :to_date"
        count_params["to_date"] = to_date

    count_rows = await execute(count_query, count_params)
    total = int(count_rows[0]["total"]) if count_rows else 0

    return {
        "logs": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/audit/logs/summary", summary="Audit log summary")
async def get_audit_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get audit event counts grouped by resource_type for the last 30 days.
    Also returns overall total and the most common action.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    resource_rows = await execute(
        """
        SELECT resource_type, COUNT(*) as count
        FROM audit_logs
        WHERE user_id = :user_id AND created_at >= :cutoff
        GROUP BY resource_type
        ORDER BY count DESC
        """,
        {"user_id": user_id, "cutoff": cutoff},
    )

    action_rows = await execute(
        """
        SELECT action, COUNT(*) as count
        FROM audit_logs
        WHERE user_id = :user_id AND created_at >= :cutoff
        GROUP BY action
        ORDER BY count DESC
        LIMIT 1
        """,
        {"user_id": user_id, "cutoff": cutoff},
    )

    by_resource = {row["resource_type"]: int(row["count"]) for row in resource_rows}
    total = sum(by_resource.values())
    most_active_resource = resource_rows[0]["resource_type"] if resource_rows else None
    most_common_action = action_rows[0]["action"] if action_rows else None

    return {
        "by_resource_type": by_resource,
        "total": total,
        "most_active_resource": most_active_resource,
        "most_common_action": most_common_action,
        "period_days": 30,
    }


@router.get("/audit/logs/export", summary="Export audit logs")
async def export_audit_logs(
    from_date: str = Query(..., description="Start date (ISO format)"),
    to_date: str = Query(..., description="End date (ISO format)"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Export audit logs as JSON for a given date range (max 90 days).
    """
    try:
        start = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        end = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    if (end - start).days > 90:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 90 days.")

    rows = await execute(
        """
        SELECT id, user_id, action, resource_type, resource_id, details,
               ip_address, user_agent, created_at
        FROM audit_logs
        WHERE user_id = :user_id AND created_at >= :from_date AND created_at <= :to_date
        ORDER BY created_at DESC
        """,
        {"user_id": user_id, "from_date": from_date, "to_date": to_date},
    )

    return {
        "logs": [dict(r) for r in rows],
        "count": len(rows),
        "from_date": from_date,
        "to_date": to_date,
    }
