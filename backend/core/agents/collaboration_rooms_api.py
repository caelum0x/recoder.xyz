"""
Agent Collaboration Rooms API.

Provides CRUD for collaboration rooms, messages, and tasks that enable
multi-agent coordination with objective tracking, task boards, and message feeds.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/collaboration", tags=["agent-collaboration"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateRoomRequest(BaseModel):
    room_name: str = Field(..., min_length=1, max_length=200, description="Room name")
    description: Optional[str] = Field(None, max_length=1000, description="Room description")
    agent_ids: Optional[List[str]] = Field(default_factory=list, description="Agent IDs to include")
    objective: Optional[str] = Field(None, max_length=2000, description="Room objective/goal")


class UpdateRoomRequest(BaseModel):
    room_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    agent_ids: Optional[List[str]] = None
    status: Optional[str] = Field(None, description="active | paused | completed | archived")
    objective: Optional[str] = Field(None, max_length=2000)


class PostMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000, description="Message content")
    agent_id: Optional[str] = Field(None, description="Agent ID if sent by an agent")
    sender_type: str = Field("user", description="user | agent | system")
    message_type: str = Field("text", description="text | task_assignment | status_update | result | handoff")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class CreateTaskRequest(BaseModel):
    task_title: str = Field(..., min_length=1, max_length=300, description="Task title")
    task_description: Optional[str] = Field(None, max_length=5000)
    assigned_agent_id: Optional[str] = Field(None, description="Agent to assign this task to")
    priority: str = Field("medium", description="low | medium | high | urgent")
    due_at: Optional[str] = Field(None, description="ISO datetime for due date")


class UpdateTaskRequest(BaseModel):
    task_title: Optional[str] = Field(None, min_length=1, max_length=300)
    task_description: Optional[str] = Field(None, max_length=5000)
    assigned_agent_id: Optional[str] = None
    status: Optional[str] = Field(None, description="pending | in_progress | completed | blocked | cancelled")
    priority: Optional[str] = Field(None, description="low | medium | high | urgent")
    result: Optional[Dict[str, Any]] = None
    due_at: Optional[str] = None


# ============================================================================
# Room Endpoints
# ============================================================================

@router.post(
    "/rooms",
    summary="Create collaboration room",
    operation_id="create_collaboration_room",
)
async def create_room(
    body: CreateRoomRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new agent collaboration room."""
    try:
        row = await execute_one(
            """
            INSERT INTO collaboration_rooms (
                user_id, room_name, description, agent_ids, objective
            ) VALUES (
                :user_id, :room_name, :description, :agent_ids, :objective
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "room_name": body.room_name,
                "description": body.description,
                "agent_ids": body.agent_ids or [],
                "objective": body.objective,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating collaboration room: {e}")
        raise HTTPException(status_code=500, detail="Failed to create collaboration room")


@router.get(
    "/rooms",
    summary="List collaboration rooms",
    operation_id="list_collaboration_rooms",
)
async def list_rooms(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
):
    """List collaboration rooms for the authenticated user."""
    try:
        where_clauses = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if status:
            valid = ("active", "paused", "completed", "archived")
            if status not in valid:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
            where_clauses.append("status = :status")
            params["status"] = status

        where_sql = " AND ".join(where_clauses)
        rows = await execute(
            f"""
            SELECT * FROM collaboration_rooms
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing collaboration rooms: {e}")
        raise HTTPException(status_code=500, detail="Failed to list collaboration rooms")


@router.get(
    "/rooms/{room_id}",
    summary="Get collaboration room detail",
    operation_id="get_collaboration_room",
)
async def get_room(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a collaboration room by ID."""
    try:
        row = await execute_one(
            """
            SELECT * FROM collaboration_rooms
            WHERE id = :room_id AND user_id = :user_id
            """,
            {"room_id": room_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Collaboration room not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get collaboration room")


@router.patch(
    "/rooms/{room_id}",
    summary="Update collaboration room",
    operation_id="update_collaboration_room",
)
async def update_room(
    room_id: str,
    body: UpdateRoomRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a collaboration room."""
    existing = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    if body.status:
        valid = ("active", "paused", "completed", "archived")
        if body.status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")

    updates = []
    params: Dict[str, Any] = {"room_id": room_id, "user_id": user_id}

    if body.room_name is not None:
        updates.append("room_name = :room_name")
        params["room_name"] = body.room_name
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if body.agent_ids is not None:
        updates.append("agent_ids = :agent_ids")
        params["agent_ids"] = body.agent_ids
    if body.status is not None:
        updates.append("status = :status")
        params["status"] = body.status
    if body.objective is not None:
        updates.append("objective = :objective")
        params["objective"] = body.objective

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = now()")

    try:
        row = await execute_one(
            f"""
            UPDATE collaboration_rooms
            SET {', '.join(updates)}
            WHERE id = :room_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Update failed")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update collaboration room")


@router.delete(
    "/rooms/{room_id}",
    summary="Delete collaboration room",
    operation_id="delete_collaboration_room",
)
async def delete_room(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a collaboration room and cascade-delete its messages and tasks."""
    existing = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    try:
        await execute_mutate(
            "DELETE FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
            {"room_id": room_id, "user_id": user_id},
        )
        return {"deleted": True, "room_id": room_id}
    except Exception as e:
        logger.error(f"Error deleting collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collaboration room")


# ============================================================================
# Message Endpoints
# ============================================================================

@router.post(
    "/rooms/{room_id}/messages",
    summary="Post message to collaboration room",
    operation_id="post_collaboration_message",
)
async def post_message(
    room_id: str,
    body: PostMessageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Post a message in a collaboration room."""
    valid_sender_types = ("user", "agent", "system")
    if body.sender_type not in valid_sender_types:
        raise HTTPException(status_code=400, detail=f"Invalid sender_type. Must be one of: {', '.join(valid_sender_types)}")

    valid_message_types = ("text", "task_assignment", "status_update", "result", "handoff")
    if body.message_type not in valid_message_types:
        raise HTTPException(status_code=400, detail=f"Invalid message_type. Must be one of: {', '.join(valid_message_types)}")

    # Verify room ownership
    room = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    try:
        import json
        row = await execute_one(
            """
            INSERT INTO collaboration_messages (
                room_id, user_id, agent_id, sender_type, content, message_type, metadata
            ) VALUES (
                :room_id, :user_id, :agent_id, :sender_type, :content, :message_type, :metadata
            )
            RETURNING *
            """,
            {
                "room_id": room_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "sender_type": body.sender_type,
                "content": body.content,
                "message_type": body.message_type,
                "metadata": json.dumps(body.metadata or {}),
            },
        )
        # Update room timestamp
        await execute_mutate(
            "UPDATE collaboration_rooms SET updated_at = now() WHERE id = :room_id",
            {"room_id": room_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error posting message to room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to post message")


@router.get(
    "/rooms/{room_id}/messages",
    summary="List messages in collaboration room",
    operation_id="list_collaboration_messages",
)
async def list_messages(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List messages in a collaboration room, ordered oldest-first."""
    room = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    try:
        rows = await execute(
            """
            SELECT * FROM collaboration_messages
            WHERE room_id = :room_id AND user_id = :user_id
            ORDER BY created_at ASC
            LIMIT :limit OFFSET :offset
            """,
            {"room_id": room_id, "user_id": user_id, "limit": limit, "offset": offset},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing messages for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list messages")


# ============================================================================
# Task Endpoints
# ============================================================================

@router.post(
    "/rooms/{room_id}/tasks",
    summary="Create collaboration task",
    operation_id="create_collaboration_task",
)
async def create_task(
    room_id: str,
    body: CreateTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a task within a collaboration room."""
    valid_priorities = ("low", "medium", "high", "urgent")
    if body.priority not in valid_priorities:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}")

    room = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    try:
        row = await execute_one(
            """
            INSERT INTO collaboration_tasks (
                room_id, user_id, assigned_agent_id, task_title, task_description,
                priority, due_at
            ) VALUES (
                :room_id, :user_id, :assigned_agent_id, :task_title, :task_description,
                :priority, :due_at
            )
            RETURNING *
            """,
            {
                "room_id": room_id,
                "user_id": user_id,
                "assigned_agent_id": body.assigned_agent_id,
                "task_title": body.task_title,
                "task_description": body.task_description,
                "priority": body.priority,
                "due_at": body.due_at,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating task in room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create task")


@router.patch(
    "/rooms/{room_id}/tasks/{task_id}",
    summary="Update collaboration task",
    operation_id="update_collaboration_task",
)
async def update_task(
    room_id: str,
    task_id: str,
    body: UpdateTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a task within a collaboration room."""
    if body.status:
        valid = ("pending", "in_progress", "completed", "blocked", "cancelled")
        if body.status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    if body.priority:
        valid_p = ("low", "medium", "high", "urgent")
        if body.priority not in valid_p:
            raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {', '.join(valid_p)}")

    existing = await execute_one(
        """
        SELECT id FROM collaboration_tasks
        WHERE id = :task_id AND room_id = :room_id AND user_id = :user_id
        """,
        {"task_id": task_id, "room_id": room_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = []
    params: Dict[str, Any] = {"task_id": task_id, "room_id": room_id, "user_id": user_id}

    if body.task_title is not None:
        updates.append("task_title = :task_title")
        params["task_title"] = body.task_title
    if body.task_description is not None:
        updates.append("task_description = :task_description")
        params["task_description"] = body.task_description
    if body.assigned_agent_id is not None:
        updates.append("assigned_agent_id = :assigned_agent_id")
        params["assigned_agent_id"] = body.assigned_agent_id
    if body.status is not None:
        updates.append("status = :status")
        params["status"] = body.status
        if body.status == "completed":
            updates.append("completed_at = now()")
    if body.priority is not None:
        updates.append("priority = :priority")
        params["priority"] = body.priority
    if body.result is not None:
        import json
        updates.append("result = :result")
        params["result"] = json.dumps(body.result)
    if body.due_at is not None:
        updates.append("due_at = :due_at")
        params["due_at"] = body.due_at

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        row = await execute_one(
            f"""
            UPDATE collaboration_tasks
            SET {', '.join(updates)}
            WHERE id = :task_id AND room_id = :room_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Update failed")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task")


@router.get(
    "/rooms/{room_id}/tasks",
    summary="List collaboration tasks",
    operation_id="list_collaboration_tasks",
)
async def list_tasks(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
):
    """List tasks in a collaboration room."""
    room = await execute_one(
        "SELECT id FROM collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Collaboration room not found")

    try:
        where_clauses = ["room_id = :room_id", "user_id = :user_id"]
        params: Dict[str, Any] = {"room_id": room_id, "user_id": user_id, "limit": limit}

        if status:
            valid = ("pending", "in_progress", "completed", "blocked", "cancelled")
            if status not in valid:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
            where_clauses.append("status = :status")
            params["status"] = status

        where_sql = " AND ".join(where_clauses)
        rows = await execute(
            f"""
            SELECT * FROM collaboration_tasks
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing tasks for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list tasks")
