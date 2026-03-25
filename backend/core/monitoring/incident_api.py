"""
Incident Tracker API endpoints.

Provides CRUD operations for agent incidents with status workflow
(open -> investigating -> resolved/dismissed), filtering, and aggregate stats.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/incidents", tags=["incidents"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateIncidentRequest(BaseModel):
    agent_id: str
    run_id: Optional[str] = None
    severity: str = "medium"
    title: str
    description: Optional[str] = None


class UpdateIncidentRequest(BaseModel):
    status: Optional[str] = None
    root_cause: Optional[str] = None
    resolution: Optional[str] = None
    severity: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class IncidentResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str
    run_id: Optional[str] = None
    severity: str
    title: str
    description: Optional[str] = None
    status: str
    root_cause: Optional[str] = None
    resolution: Optional[str] = None
    auto_created: bool = False
    created_at: str
    resolved_at: Optional[str] = None


class IncidentStatsResponse(BaseModel):
    open_by_severity: dict = Field(default_factory=dict)
    avg_resolution_hours: Optional[float] = None
    most_affected_agents: list = Field(default_factory=list)
    total_open: int = 0


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create Incident",
    operation_id="create_incident",
)
async def create_incident(
    body: CreateIncidentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new incident for an agent."""
    # Validate severity
    valid_severities = {"low", "medium", "high", "critical"}
    if body.severity not in valid_severities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid severity: {body.severity}. Must be one of: {', '.join(valid_severities)}"
        )

    try:
        rows = await execute_mutate(
            """
            INSERT INTO agent_incidents
                (user_id, agent_id, run_id, severity, title, description)
            VALUES
                (:user_id, :agent_id, :run_id, :severity, :title, :description)
            RETURNING id, user_id, agent_id, run_id, severity, title, description,
                      status, root_cause, resolution, auto_created, created_at, resolved_at
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "run_id": body.run_id,
                "severity": body.severity,
                "title": body.title,
                "description": body.description,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create incident")

        row = rows[0]
        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "agent_id": row["agent_id"],
            "run_id": row["run_id"],
            "severity": row["severity"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "root_cause": row["root_cause"],
            "resolution": row["resolution"],
            "auto_created": row["auto_created"],
            "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            "resolved_at": None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating incident: {e}")
        raise HTTPException(status_code=500, detail="Failed to create incident")


@router.get(
    "",
    summary="List Incidents",
    operation_id="list_incidents",
)
async def list_incidents(
    agent_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List incidents with optional filters."""
    try:
        # Build dynamic WHERE clauses
        conditions = ["i.user_id::text = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

        if agent_id:
            conditions.append("i.agent_id::text = :agent_id")
            params["agent_id"] = agent_id

        if status:
            conditions.append("i.status = :status")
            params["status"] = status

        if severity:
            conditions.append("i.severity = :severity")
            params["severity"] = severity

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT
                i.id, i.user_id, i.agent_id, i.run_id, i.severity, i.title,
                i.description, i.status, i.root_cause, i.resolution,
                i.auto_created, i.created_at, i.resolved_at,
                a.name AS agent_name
            FROM agent_incidents i
            LEFT JOIN agents a ON a.agent_id::text = i.agent_id::text
            WHERE {where_clause}
            ORDER BY i.created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        results = []
        for row in rows:
            results.append({
                "id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "agent_id": row["agent_id"],
                "agent_name": row.get("agent_name"),
                "run_id": row["run_id"],
                "severity": row["severity"],
                "title": row["title"],
                "description": row["description"],
                "status": row["status"],
                "root_cause": row["root_cause"],
                "resolution": row["resolution"],
                "auto_created": row["auto_created"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
                "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat") else None,
            })

        return results

    except Exception as e:
        logger.error(f"Error listing incidents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list incidents")


@router.get(
    "/stats",
    summary="Incident Stats",
    operation_id="get_incident_stats",
)
async def get_incident_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate incident statistics: open count by severity, avg resolution time, most affected agents."""
    try:
        # Open count by severity
        severity_rows = await execute(
            """
            SELECT severity, COUNT(*) AS cnt
            FROM agent_incidents
            WHERE user_id::text = :user_id AND status NOT IN ('resolved', 'dismissed')
            GROUP BY severity
            """,
            {"user_id": user_id},
        )
        open_by_severity = {}
        total_open = 0
        for row in severity_rows:
            count = int(row["cnt"])
            open_by_severity[row["severity"]] = count
            total_open += count

        # Average resolution time (hours)
        avg_row = await execute_one(
            """
            SELECT AVG(
                EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
            ) AS avg_hours
            FROM agent_incidents
            WHERE user_id::text = :user_id
              AND status = 'resolved'
              AND resolved_at IS NOT NULL
            """,
            {"user_id": user_id},
        )
        avg_resolution_hours = None
        if avg_row and avg_row["avg_hours"] is not None:
            avg_resolution_hours = round(float(avg_row["avg_hours"]), 1)

        # Most affected agents (top 5 by open incident count)
        agent_rows = await execute(
            """
            SELECT i.agent_id, a.name AS agent_name, COUNT(*) AS incident_count
            FROM agent_incidents i
            LEFT JOIN agents a ON a.agent_id::text = i.agent_id::text
            WHERE i.user_id::text = :user_id AND i.status NOT IN ('resolved', 'dismissed')
            GROUP BY i.agent_id, a.name
            ORDER BY incident_count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        most_affected_agents = []
        for row in agent_rows:
            most_affected_agents.append({
                "agent_id": row["agent_id"],
                "agent_name": row.get("agent_name"),
                "incident_count": int(row["incident_count"]),
            })

        return {
            "open_by_severity": open_by_severity,
            "avg_resolution_hours": avg_resolution_hours,
            "most_affected_agents": most_affected_agents,
            "total_open": total_open,
        }

    except Exception as e:
        logger.error(f"Error fetching incident stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch incident stats")


@router.get(
    "/{incident_id}",
    summary="Get Incident Detail",
    operation_id="get_incident",
)
async def get_incident(
    incident_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single incident by ID."""
    try:
        row = await execute_one(
            """
            SELECT
                i.id, i.user_id, i.agent_id, i.run_id, i.severity, i.title,
                i.description, i.status, i.root_cause, i.resolution,
                i.auto_created, i.created_at, i.resolved_at,
                a.name AS agent_name
            FROM agent_incidents i
            LEFT JOIN agents a ON a.agent_id::text = i.agent_id::text
            WHERE i.id::text = :incident_id AND i.user_id::text = :user_id
            """,
            {"incident_id": incident_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")

        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "agent_id": row["agent_id"],
            "agent_name": row.get("agent_name"),
            "run_id": row["run_id"],
            "severity": row["severity"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "root_cause": row["root_cause"],
            "resolution": row["resolution"],
            "auto_created": row["auto_created"],
            "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch incident")


@router.patch(
    "/{incident_id}",
    summary="Update Incident",
    operation_id="update_incident",
)
async def update_incident(
    incident_id: str,
    body: UpdateIncidentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an incident's status, root cause, resolution, or other fields."""
    # Validate status if provided
    if body.status:
        valid_statuses = {"open", "investigating", "resolved", "dismissed"}
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {body.status}. Must be one of: {', '.join(valid_statuses)}"
            )

    # Validate severity if provided
    if body.severity:
        valid_severities = {"low", "medium", "high", "critical"}
        if body.severity not in valid_severities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid severity: {body.severity}. Must be one of: {', '.join(valid_severities)}"
            )

    try:
        # Build dynamic SET clause
        set_parts = []
        params: dict = {"incident_id": incident_id, "user_id": user_id}

        if body.status is not None:
            set_parts.append("status = :status")
            params["status"] = body.status
            # Auto-set resolved_at when status changes to resolved
            if body.status == "resolved":
                set_parts.append("resolved_at = now()")

        if body.root_cause is not None:
            set_parts.append("root_cause = :root_cause")
            params["root_cause"] = body.root_cause

        if body.resolution is not None:
            set_parts.append("resolution = :resolution")
            params["resolution"] = body.resolution

        if body.severity is not None:
            set_parts.append("severity = :severity")
            params["severity"] = body.severity

        if body.title is not None:
            set_parts.append("title = :title")
            params["title"] = body.title

        if body.description is not None:
            set_parts.append("description = :description")
            params["description"] = body.description

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(set_parts)

        rows = await execute_mutate(
            f"""
            UPDATE agent_incidents
            SET {set_clause}
            WHERE id = :incident_id AND user_id::text = :user_id
            RETURNING id, user_id, agent_id, run_id, severity, title, description,
                      status, root_cause, resolution, auto_created, created_at, resolved_at
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Incident not found")

        row = rows[0]
        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "agent_id": row["agent_id"],
            "run_id": row["run_id"],
            "severity": row["severity"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "root_cause": row["root_cause"],
            "resolution": row["resolution"],
            "auto_created": row["auto_created"],
            "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update incident")
