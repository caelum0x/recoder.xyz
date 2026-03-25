"""
Workspace management API endpoints.

Provides CRUD for workspaces, member management, agent/thread assignment,
and activity tracking. Access control via WHERE user_id::text = :user_id.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["workspace-management"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateWorkspaceRequest(BaseModel):
    workspace_name: str
    description: Optional[str] = None
    color: Optional[str] = '#6366f1'
    icon: Optional[str] = 'folder'
    is_default: Optional[bool] = False


class UpdateWorkspaceRequest(BaseModel):
    workspace_name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = None


class AddAgentRequest(BaseModel):
    agent_id: str


class AddThreadRequest(BaseModel):
    thread_id: str


class RecordActivityRequest(BaseModel):
    activity_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    description: Optional[str] = None


# ============================================================================
# Helper
# ============================================================================

def _serialize_workspace(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "workspace_name": row["workspace_name"],
        "description": row.get("description"),
        "color": row.get("color") or "#6366f1",
        "icon": row.get("icon") or "folder",
        "agent_ids": row.get("agent_ids") or [],
        "thread_ids": row.get("thread_ids") or [],
        "is_default": bool(row.get("is_default", False)),
        "member_count": int(row["member_count"]) if row.get("member_count") is not None else 0,
        "agent_count": int(row["agent_count"]) if row.get("agent_count") is not None else 0,
        "thread_count": int(row["thread_count"]) if row.get("thread_count") is not None else 0,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


# ============================================================================
# Static routes FIRST (before parameterized /{workspace_id} routes)
# ============================================================================

@router.post("/workspaces", summary="Create workspace")
async def create_workspace(
    body: CreateWorkspaceRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new workspace for the current user."""
    try:
        row = await execute_one(
            """
            INSERT INTO workspaces (user_id, workspace_name, description, color, icon, is_default)
            VALUES (:user_id, :workspace_name, :description, :color, :icon, :is_default)
            RETURNING id, user_id, workspace_name, description, color, icon,
                      agent_ids, thread_ids, is_default, created_at, updated_at
            """,
            {
                "user_id": user_id,
                "workspace_name": body.workspace_name,
                "description": body.description,
                "color": body.color or "#6366f1",
                "icon": body.icon or "folder",
                "is_default": body.is_default or False,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create workspace")

        result = dict(row)
        result["member_count"] = 0
        result["agent_count"] = 0
        result["thread_count"] = 0
        return _serialize_workspace(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating workspace: {e}")
        raise HTTPException(status_code=500, detail="Failed to create workspace")


@router.get("/workspaces", summary="List workspaces")
async def list_workspaces(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all workspaces owned by the current user with member/agent/thread counts."""
    try:
        rows = await execute(
            """
            SELECT w.*,
              (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id::text = w.id::text) as member_count,
              COALESCE(array_length(w.agent_ids, 1), 0) as agent_count,
              COALESCE(array_length(w.thread_ids, 1), 0) as thread_count
            FROM workspaces w
            WHERE w.user_id::text = :user_id
            ORDER BY w.created_at DESC
            """,
            {"user_id": user_id},
        )
        return [_serialize_workspace(dict(row)) for row in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing workspaces: {e}")
        raise HTTPException(status_code=500, detail="Failed to list workspaces")


# ============================================================================
# Parameterized routes
# ============================================================================

@router.get("/workspaces/{workspace_id}", summary="Get workspace detail")
async def get_workspace(
    workspace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single workspace by ID."""
    try:
        row = await execute_one(
            """
            SELECT w.*,
              (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id::text = w.id::text) as member_count,
              COALESCE(array_length(w.agent_ids, 1), 0) as agent_count,
              COALESCE(array_length(w.thread_ids, 1), 0) as thread_count
            FROM workspaces w
            WHERE w.id::text = :workspace_id AND w.user_id::text = :user_id
            """,
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return _serialize_workspace(dict(row))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get workspace")


@router.patch("/workspaces/{workspace_id}", summary="Update workspace")
async def update_workspace(
    workspace_id: str,
    body: UpdateWorkspaceRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update workspace fields."""
    try:
        updates = {}
        if body.workspace_name is not None:
            updates["workspace_name"] = body.workspace_name
        if body.description is not None:
            updates["description"] = body.description
        if body.color is not None:
            updates["color"] = body.color
        if body.icon is not None:
            updates["icon"] = body.icon
        if body.is_default is not None:
            updates["is_default"] = body.is_default

        if not updates:
            # Nothing to update — just return current state
            return await get_workspace(workspace_id, user_id)

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        params = {**updates, "workspace_id": workspace_id, "user_id": user_id}

        row = await execute_one(
            f"""
            UPDATE workspaces
            SET {set_clauses}, updated_at = now()
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id, user_id, workspace_name, description, color, icon,
                      agent_ids, thread_ids, is_default, created_at, updated_at
            """,
            params,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")

        result = dict(row)
        result["member_count"] = 0
        result["agent_count"] = 0
        result["thread_count"] = 0
        return _serialize_workspace(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update workspace")


@router.delete("/workspaces/{workspace_id}", summary="Delete workspace")
async def delete_workspace(
    workspace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a workspace (cascades to members and activity)."""
    try:
        row = await execute_one(
            """
            DELETE FROM workspaces
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"deleted": True, "workspace_id": str(row["id"])}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete workspace")


@router.post("/workspaces/{workspace_id}/agents", summary="Add agent to workspace")
async def add_agent_to_workspace(
    workspace_id: str,
    body: AddAgentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Append an agent_id to the workspace's agent_ids array."""
    try:
        row = await execute_one(
            """
            UPDATE workspaces
            SET agent_ids = array_append(agent_ids, :agent_id), updated_at = now()
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"workspace_id": workspace_id, "user_id": user_id, "agent_id": body.agent_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"workspace_id": workspace_id, "agent_id": body.agent_id, "added": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding agent to workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to add agent to workspace")


@router.delete("/workspaces/{workspace_id}/agents/{agent_id}", summary="Remove agent from workspace")
async def remove_agent_from_workspace(
    workspace_id: str,
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove an agent_id from the workspace's agent_ids array."""
    try:
        row = await execute_one(
            """
            UPDATE workspaces
            SET agent_ids = array_remove(agent_ids, :agent_id), updated_at = now()
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"workspace_id": workspace_id, "user_id": user_id, "agent_id": agent_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"workspace_id": workspace_id, "agent_id": agent_id, "removed": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing agent from workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove agent from workspace")


@router.post("/workspaces/{workspace_id}/threads", summary="Add thread to workspace")
async def add_thread_to_workspace(
    workspace_id: str,
    body: AddThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Append a thread_id to the workspace's thread_ids array."""
    try:
        row = await execute_one(
            """
            UPDATE workspaces
            SET thread_ids = array_append(thread_ids, :thread_id), updated_at = now()
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"workspace_id": workspace_id, "user_id": user_id, "thread_id": body.thread_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"workspace_id": workspace_id, "thread_id": body.thread_id, "added": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding thread to workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to add thread to workspace")


@router.delete("/workspaces/{workspace_id}/threads/{thread_id}", summary="Remove thread from workspace")
async def remove_thread_from_workspace(
    workspace_id: str,
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a thread_id from the workspace's thread_ids array."""
    try:
        row = await execute_one(
            """
            UPDATE workspaces
            SET thread_ids = array_remove(thread_ids, :thread_id), updated_at = now()
            WHERE id = :workspace_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"workspace_id": workspace_id, "user_id": user_id, "thread_id": thread_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"workspace_id": workspace_id, "thread_id": thread_id, "removed": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing thread from workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove thread from workspace")


@router.post("/workspaces/{workspace_id}/activity", summary="Record workspace activity")
async def record_workspace_activity(
    workspace_id: str,
    body: RecordActivityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record an activity event on a workspace."""
    try:
        # Verify ownership
        exists = await execute_one(
            "SELECT id FROM workspaces WHERE id = :workspace_id AND user_id::text = :user_id",
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Workspace not found")

        row = await execute_one(
            """
            INSERT INTO workspace_activity
              (workspace_id, user_id, activity_type, entity_type, entity_id, description)
            VALUES
              (:workspace_id, :user_id, :activity_type, :entity_type, :entity_id, :description)
            RETURNING id, workspace_id, user_id, activity_type, entity_type, entity_id, description, occurred_at
            """,
            {
                "workspace_id": workspace_id,
                "user_id": user_id,
                "activity_type": body.activity_type,
                "entity_type": body.entity_type,
                "entity_id": body.entity_id,
                "description": body.description,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to record activity")

        return {
            "id": str(row["id"]),
            "workspace_id": str(row["workspace_id"]),
            "user_id": str(row["user_id"]),
            "activity_type": row["activity_type"],
            "entity_type": row.get("entity_type"),
            "entity_id": row.get("entity_id"),
            "description": row.get("description"),
            "occurred_at": str(row["occurred_at"]),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording activity for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record workspace activity")


@router.get("/workspaces/{workspace_id}/activity", summary="List workspace activity")
async def list_workspace_activity(
    workspace_id: str,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List activity events for a workspace in reverse chronological order."""
    try:
        # Verify ownership
        exists = await execute_one(
            "SELECT id FROM workspaces WHERE id = :workspace_id AND user_id::text = :user_id",
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Workspace not found")

        rows = await execute(
            """
            SELECT id, workspace_id, user_id, activity_type, entity_type, entity_id, description, occurred_at
            FROM workspace_activity
            WHERE workspace_id::text = :workspace_id
            ORDER BY occurred_at DESC
            LIMIT :limit
            """,
            {"workspace_id": workspace_id, "limit": limit},
        )

        return [
            {
                "id": str(row["id"]),
                "workspace_id": str(row["workspace_id"]),
                "user_id": str(row["user_id"]),
                "activity_type": row["activity_type"],
                "entity_type": row.get("entity_type"),
                "entity_id": row.get("entity_id"),
                "description": row.get("description"),
                "occurred_at": str(row["occurred_at"]),
            }
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing activity for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list workspace activity")
