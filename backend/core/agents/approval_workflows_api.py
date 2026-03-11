"""
Approval Workflows API endpoints.

Provides CRUD for agent approval workflows and requests, enabling
human-in-the-loop approval gates for agent actions.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/approval", tags=["approval-workflows"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateWorkflowRequest(BaseModel):
    workflow_name: str
    agent_id: Optional[str] = None
    trigger_conditions: Dict[str, Any] = Field(default_factory=dict)
    approvers: List[str] = Field(default_factory=list)
    approval_timeout_hours: int = Field(default=24, ge=1, le=720)
    auto_reject_on_timeout: bool = False


class UpdateWorkflowRequest(BaseModel):
    workflow_name: Optional[str] = None
    agent_id: Optional[str] = None
    trigger_conditions: Optional[Dict[str, Any]] = None
    approvers: Optional[List[str]] = None
    approval_timeout_hours: Optional[int] = Field(default=None, ge=1, le=720)
    auto_reject_on_timeout: Optional[bool] = None
    is_active: Optional[bool] = None


class CreateRequestBody(BaseModel):
    agent_id: str
    action_type: str
    action_data: Dict[str, Any] = Field(default_factory=dict)
    workflow_id: Optional[str] = None


class DecisionBody(BaseModel):
    decision_note: Optional[str] = None


# ============================================================================
# Endpoints — Workflows
# ============================================================================

@router.post(
    "/workflows",
    summary="Create approval workflow",
    operation_id="create_approval_workflow",
)
async def create_workflow(
    body: CreateWorkflowRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new approval workflow configuration."""
    try:
        row = await execute_one(
            """
            INSERT INTO approval_workflows (
                user_id, workflow_name, agent_id, trigger_conditions,
                approvers, approval_timeout_hours, auto_reject_on_timeout
            ) VALUES (
                :user_id, :workflow_name, :agent_id, :trigger_conditions,
                :approvers, :approval_timeout_hours, :auto_reject_on_timeout
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "workflow_name": body.workflow_name,
                "agent_id": body.agent_id,
                "trigger_conditions": body.trigger_conditions,
                "approvers": body.approvers,
                "approval_timeout_hours": body.approval_timeout_hours,
                "auto_reject_on_timeout": body.auto_reject_on_timeout,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating approval workflow: {e}")
        raise HTTPException(status_code=500, detail="Failed to create workflow")


@router.get(
    "/workflows",
    summary="List approval workflows",
    operation_id="list_approval_workflows",
)
async def list_workflows(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all approval workflows for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM approval_workflows
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing approval workflows: {e}")
        raise HTTPException(status_code=500, detail="Failed to list workflows")


@router.patch(
    "/workflows/{workflow_id}",
    summary="Update approval workflow",
    operation_id="update_approval_workflow",
)
async def update_workflow(
    workflow_id: str,
    body: UpdateWorkflowRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing approval workflow."""
    try:
        existing = await execute_one(
            "SELECT id FROM approval_workflows WHERE id = :id AND user_id = :user_id",
            {"id": workflow_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Workflow not found")

        updates: Dict[str, Any] = {}
        if body.workflow_name is not None:
            updates["workflow_name"] = body.workflow_name
        if body.agent_id is not None:
            updates["agent_id"] = body.agent_id
        if body.trigger_conditions is not None:
            updates["trigger_conditions"] = body.trigger_conditions
        if body.approvers is not None:
            updates["approvers"] = body.approvers
        if body.approval_timeout_hours is not None:
            updates["approval_timeout_hours"] = body.approval_timeout_hours
        if body.auto_reject_on_timeout is not None:
            updates["auto_reject_on_timeout"] = body.auto_reject_on_timeout
        if body.is_active is not None:
            updates["is_active"] = body.is_active

        if not updates:
            row = await execute_one(
                "SELECT * FROM approval_workflows WHERE id = :id AND user_id = :user_id",
                {"id": workflow_id, "user_id": user_id},
            )
            return serialize_row(row)

        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        params = {**updates, "id": workflow_id, "user_id": user_id}

        row = await execute_one(
            f"""
            UPDATE approval_workflows
            SET {set_clause}
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating approval workflow {workflow_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update workflow")


@router.delete(
    "/workflows/{workflow_id}",
    summary="Delete approval workflow",
    operation_id="delete_approval_workflow",
)
async def delete_workflow(
    workflow_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an approval workflow."""
    try:
        result = await execute_mutate(
            "DELETE FROM approval_workflows WHERE id = :id AND user_id = :user_id",
            {"id": workflow_id, "user_id": user_id},
        )
        if not result:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting approval workflow {workflow_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete workflow")


# ============================================================================
# Endpoints — Requests
# ============================================================================

@router.post(
    "/requests",
    summary="Create approval request",
    operation_id="create_approval_request",
)
async def create_request(
    body: CreateRequestBody,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new approval request for an agent action."""
    try:
        # Determine timeout from linked workflow or default 24h
        timeout_hours = 24
        if body.workflow_id:
            wf = await execute_one(
                "SELECT approval_timeout_hours FROM approval_workflows WHERE id = :id AND user_id = :user_id",
                {"id": body.workflow_id, "user_id": user_id},
            )
            if wf:
                timeout_hours = wf["approval_timeout_hours"]

        expires_at = datetime.now(timezone.utc) + timedelta(hours=timeout_hours)

        row = await execute_one(
            """
            INSERT INTO approval_requests (
                workflow_id, user_id, agent_id, action_type, action_data, expires_at
            ) VALUES (
                :workflow_id, :user_id, :agent_id, :action_type, :action_data, :expires_at
            )
            RETURNING *
            """,
            {
                "workflow_id": body.workflow_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "action_type": body.action_type,
                "action_data": body.action_data,
                "expires_at": expires_at.isoformat(),
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating approval request: {e}")
        raise HTTPException(status_code=500, detail="Failed to create approval request")


@router.get(
    "/requests",
    summary="List approval requests",
    operation_id="list_approval_requests",
)
async def list_requests(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None, description="Filter by status"),
    agent_id: Optional[str] = Query(None, description="Filter by agent"),
    limit: int = Query(50, ge=1, le=200),
):
    """List approval requests for the authenticated user."""
    try:
        where_clauses = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if status:
            where_clauses.append("status = :status")
            params["status"] = status

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM approval_requests
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing approval requests: {e}")
        raise HTTPException(status_code=500, detail="Failed to list approval requests")


@router.get(
    "/requests/{request_id}",
    summary="Get approval request",
    operation_id="get_approval_request",
)
async def get_request(
    request_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single approval request by ID."""
    try:
        row = await execute_one(
            "SELECT * FROM approval_requests WHERE id = :id AND user_id = :user_id",
            {"id": request_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Approval request not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching approval request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch approval request")


@router.post(
    "/requests/{request_id}/approve",
    summary="Approve a request",
    operation_id="approve_request",
)
async def approve_request(
    request_id: str,
    body: DecisionBody,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Approve a pending approval request."""
    try:
        existing = await execute_one(
            "SELECT status FROM approval_requests WHERE id = :id AND user_id = :user_id",
            {"id": request_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Approval request not found")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not in pending state")

        row = await execute_one(
            """
            UPDATE approval_requests
            SET status = 'approved',
                decision_note = :decision_note,
                decided_by = :decided_by,
                decided_at = now()
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            {
                "decision_note": body.decision_note,
                "decided_by": user_id,
                "id": request_id,
                "user_id": user_id,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to approve request")


@router.post(
    "/requests/{request_id}/reject",
    summary="Reject a request",
    operation_id="reject_request",
)
async def reject_request(
    request_id: str,
    body: DecisionBody,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reject a pending approval request."""
    try:
        existing = await execute_one(
            "SELECT status FROM approval_requests WHERE id = :id AND user_id = :user_id",
            {"id": request_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Approval request not found")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not in pending state")

        row = await execute_one(
            """
            UPDATE approval_requests
            SET status = 'rejected',
                decision_note = :decision_note,
                decided_by = :decided_by,
                decided_at = now()
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            {
                "decision_note": body.decision_note,
                "decided_by": user_id,
                "id": request_id,
                "user_id": user_id,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reject request")


@router.post(
    "/requests/{request_id}/cancel",
    summary="Cancel a request",
    operation_id="cancel_approval_request",
)
async def cancel_request(
    request_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Cancel a pending approval request."""
    try:
        existing = await execute_one(
            "SELECT status FROM approval_requests WHERE id = :id AND user_id = :user_id",
            {"id": request_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Approval request not found")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")

        row = await execute_one(
            """
            UPDATE approval_requests
            SET status = 'cancelled',
                decided_at = now()
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            {"id": request_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel request")


# ============================================================================
# Endpoint — Stats
# ============================================================================

@router.get(
    "/stats",
    summary="Get approval stats",
    operation_id="get_approval_stats",
)
async def get_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Summary statistics for the user's approval requests."""
    try:
        row = await execute_one(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')) AS decided_count,
                COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600.0
                    ) FILTER (WHERE decided_at IS NOT NULL),
                    0
                ) AS avg_decision_time_hours
            FROM approval_requests
            WHERE user_id = :user_id
            """,
            {"user_id": user_id},
        )

        pending_count = int(row["pending_count"] or 0)
        decided_count = int(row["decided_count"] or 0)
        approved_count = int(row["approved_count"] or 0)
        avg_hours = float(row["avg_decision_time_hours"] or 0)

        approval_rate = round((approved_count / decided_count) * 100, 2) if decided_count > 0 else 0.0

        # Counts by action_type
        type_rows = await execute(
            """
            SELECT action_type, COUNT(*) AS cnt
            FROM approval_requests
            WHERE user_id = :user_id
            GROUP BY action_type
            ORDER BY cnt DESC
            """,
            {"user_id": user_id},
        )
        by_action_type: Dict[str, int] = {}
        if type_rows:
            for r in type_rows:
                by_action_type[r["action_type"]] = int(r["cnt"])

        return {
            "pending_count": pending_count,
            "approval_rate": approval_rate,
            "avg_decision_time_hours": round(avg_hours, 2),
            "by_action_type": by_action_type,
        }
    except Exception as e:
        logger.error(f"Error fetching approval stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch approval stats")
