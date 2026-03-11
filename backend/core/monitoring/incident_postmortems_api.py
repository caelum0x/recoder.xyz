"""
Incident Postmortems API endpoints.

Provides CRUD operations for incident postmortems with structured fields
(timeline, root cause, impact, action items, lessons learned) and publishing workflow.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/postmortems", tags=["incident-postmortems"])


# ============================================================================
# Pydantic Models
# ============================================================================

class TimelineEntry(BaseModel):
    timestamp: Optional[str] = None
    description: str = ""


class ActionItem(BaseModel):
    description: str = ""
    assignee: Optional[str] = None
    status: str = "pending"
    due_date: Optional[str] = None


class CreatePostmortemRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    incident_id: Optional[str] = None
    severity: str = "medium"
    summary: Optional[str] = None
    root_cause: Optional[str] = None
    impact: Optional[str] = None
    action_items: Optional[List[dict]] = None
    lessons_learned: Optional[List[str]] = None
    affected_agents: Optional[List[str]] = None
    started_at: Optional[str] = None
    resolved_at: Optional[str] = None


class UpdatePostmortemRequest(BaseModel):
    title: Optional[str] = None
    incident_id: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    timeline: Optional[List[dict]] = None
    root_cause: Optional[str] = None
    impact: Optional[str] = None
    action_items: Optional[List[dict]] = None
    lessons_learned: Optional[List[str]] = None
    affected_agents: Optional[List[str]] = None
    started_at: Optional[str] = None
    resolved_at: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

def _serialize_row(row: dict) -> dict:
    """Serialize a postmortem row for JSON response."""
    result = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif isinstance(v, (bytes, memoryview)):
            result[k] = str(v)
        else:
            result[k] = v
    # Ensure id and user_id are strings
    if "id" in result:
        result["id"] = str(result["id"])
    if "user_id" in result:
        result["user_id"] = str(result["user_id"])
    return result


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create Postmortem",
    operation_id="create_postmortem",
)
async def create_postmortem(
    body: CreatePostmortemRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new incident postmortem."""
    valid_severities = {"low", "medium", "high", "critical"}
    if body.severity not in valid_severities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid severity: {body.severity}. Must be one of: {', '.join(valid_severities)}"
        )

    try:
        params = {
            "user_id": user_id,
            "title": body.title,
            "incident_id": body.incident_id,
            "severity": body.severity,
            "summary": body.summary,
            "root_cause": body.root_cause,
            "impact": body.impact,
            "action_items": body.action_items or [],
            "lessons_learned": body.lessons_learned or [],
            "affected_agents": body.affected_agents or [],
            "started_at": body.started_at,
            "resolved_at": body.resolved_at,
        }

        rows = await execute_mutate(
            """
            INSERT INTO incident_postmortems
                (user_id, title, incident_id, severity, summary, root_cause,
                 impact, action_items, lessons_learned, affected_agents,
                 started_at, resolved_at)
            VALUES
                (:user_id, :title, :incident_id, :severity, :summary, :root_cause,
                 :impact, :action_items::jsonb, :lessons_learned, :affected_agents,
                 :started_at::timestamptz, :resolved_at::timestamptz)
            RETURNING *
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create postmortem")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating postmortem: {e}")
        raise HTTPException(status_code=500, detail="Failed to create postmortem")


@router.get(
    "/stats",
    summary="Postmortem Stats",
    operation_id="get_postmortem_stats",
)
async def get_postmortem_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate postmortem statistics."""
    try:
        # Total count
        total_row = await execute_one(
            "SELECT COUNT(*) AS total FROM incident_postmortems WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        total = int(total_row["total"]) if total_row else 0

        # Count by severity
        severity_rows = await execute(
            """
            SELECT severity, COUNT(*) AS cnt
            FROM incident_postmortems
            WHERE user_id = :user_id
            GROUP BY severity
            """,
            {"user_id": user_id},
        )
        by_severity = {}
        for row in severity_rows:
            by_severity[row["severity"]] = int(row["cnt"])

        # Count by status
        status_rows = await execute(
            """
            SELECT status, COUNT(*) AS cnt
            FROM incident_postmortems
            WHERE user_id = :user_id
            GROUP BY status
            """,
            {"user_id": user_id},
        )
        by_status = {}
        for row in status_rows:
            by_status[row["status"]] = int(row["cnt"])

        # Average resolution time (hours)
        avg_row = await execute_one(
            """
            SELECT AVG(
                EXTRACT(EPOCH FROM (resolved_at - started_at)) / 3600
            ) AS avg_hours
            FROM incident_postmortems
            WHERE user_id = :user_id
              AND resolved_at IS NOT NULL
              AND started_at IS NOT NULL
            """,
            {"user_id": user_id},
        )
        avg_resolution_hours = None
        if avg_row and avg_row["avg_hours"] is not None:
            avg_resolution_hours = round(float(avg_row["avg_hours"]), 1)

        return {
            "total": total,
            "by_severity": by_severity,
            "by_status": by_status,
            "avg_resolution_hours": avg_resolution_hours,
        }

    except Exception as e:
        logger.error(f"Error fetching postmortem stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch postmortem stats")


@router.get(
    "",
    summary="List Postmortems",
    operation_id="list_postmortems",
)
async def list_postmortems(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List postmortems with optional filters."""
    try:
        conditions = ["user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

        if status:
            conditions.append("status = :status")
            params["status"] = status

        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT *
            FROM incident_postmortems
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        return [_serialize_row(row) for row in rows]

    except Exception as e:
        logger.error(f"Error listing postmortems: {e}")
        raise HTTPException(status_code=500, detail="Failed to list postmortems")


@router.get(
    "/{postmortem_id}",
    summary="Get Postmortem Detail",
    operation_id="get_postmortem",
)
async def get_postmortem(
    postmortem_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single postmortem by ID."""
    try:
        row = await execute_one(
            """
            SELECT *
            FROM incident_postmortems
            WHERE id = :postmortem_id AND user_id = :user_id
            """,
            {"postmortem_id": postmortem_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Postmortem not found")

        return _serialize_row(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching postmortem {postmortem_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch postmortem")


@router.patch(
    "/{postmortem_id}",
    summary="Update Postmortem",
    operation_id="update_postmortem",
)
async def update_postmortem(
    postmortem_id: str,
    body: UpdatePostmortemRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a postmortem's fields."""
    if body.status:
        valid_statuses = {"draft", "in_review", "published", "archived"}
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {body.status}. Must be one of: {', '.join(valid_statuses)}"
            )

    if body.severity:
        valid_severities = {"low", "medium", "high", "critical"}
        if body.severity not in valid_severities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid severity: {body.severity}. Must be one of: {', '.join(valid_severities)}"
            )

    try:
        set_parts = ["updated_at = now()"]
        params: dict = {"postmortem_id": postmortem_id, "user_id": user_id}

        if body.title is not None:
            set_parts.append("title = :title")
            params["title"] = body.title

        if body.incident_id is not None:
            set_parts.append("incident_id = :incident_id")
            params["incident_id"] = body.incident_id

        if body.severity is not None:
            set_parts.append("severity = :severity")
            params["severity"] = body.severity

        if body.status is not None:
            set_parts.append("status = :status")
            params["status"] = body.status

        if body.summary is not None:
            set_parts.append("summary = :summary")
            params["summary"] = body.summary

        if body.timeline is not None:
            set_parts.append("timeline = :timeline::jsonb")
            params["timeline"] = body.timeline

        if body.root_cause is not None:
            set_parts.append("root_cause = :root_cause")
            params["root_cause"] = body.root_cause

        if body.impact is not None:
            set_parts.append("impact = :impact")
            params["impact"] = body.impact

        if body.action_items is not None:
            set_parts.append("action_items = :action_items::jsonb")
            params["action_items"] = body.action_items

        if body.lessons_learned is not None:
            set_parts.append("lessons_learned = :lessons_learned")
            params["lessons_learned"] = body.lessons_learned

        if body.affected_agents is not None:
            set_parts.append("affected_agents = :affected_agents")
            params["affected_agents"] = body.affected_agents

        if body.started_at is not None:
            set_parts.append("started_at = :started_at::timestamptz")
            params["started_at"] = body.started_at

        if body.resolved_at is not None:
            set_parts.append("resolved_at = :resolved_at::timestamptz")
            params["resolved_at"] = body.resolved_at

        if len(set_parts) == 1:
            # Only updated_at was added, nothing to actually update
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(set_parts)

        rows = await execute_mutate(
            f"""
            UPDATE incident_postmortems
            SET {set_clause}
            WHERE id = :postmortem_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Postmortem not found")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating postmortem {postmortem_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update postmortem")


@router.delete(
    "/{postmortem_id}",
    summary="Delete Postmortem",
    operation_id="delete_postmortem",
)
async def delete_postmortem(
    postmortem_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a postmortem."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM incident_postmortems
            WHERE id = :postmortem_id AND user_id = :user_id
            RETURNING id
            """,
            {"postmortem_id": postmortem_id, "user_id": user_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Postmortem not found")

        return {"deleted": True, "id": str(rows[0]["id"])}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting postmortem {postmortem_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete postmortem")


@router.post(
    "/{postmortem_id}/publish",
    summary="Publish Postmortem",
    operation_id="publish_postmortem",
)
async def publish_postmortem(
    postmortem_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set a postmortem's status to published."""
    try:
        rows = await execute_mutate(
            """
            UPDATE incident_postmortems
            SET status = 'published', updated_at = now()
            WHERE id = :postmortem_id AND user_id = :user_id
            RETURNING *
            """,
            {"postmortem_id": postmortem_id, "user_id": user_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Postmortem not found")

        return _serialize_row(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing postmortem {postmortem_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to publish postmortem")
