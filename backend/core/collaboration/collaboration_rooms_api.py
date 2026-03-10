"""
Agent Collaboration Rooms API.

Provides CRUD endpoints for collaboration rooms where users and agents
can discuss, review, debug, and plan together.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/collaboration/rooms", tags=["collaboration-rooms"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateRoomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Room name")
    description: Optional[str] = Field(None, max_length=1000, description="Room description")
    room_type: str = Field("discussion", description="Room type: discussion, review, debugging, planning")
    agent_ids: List[str] = Field(default_factory=list, description="Agent IDs to include")


class UpdateRoomRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = Field(None, description="Status: active, archived, resolved")
    agent_ids: Optional[List[str]] = None


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000, description="Message content")
    message_type: str = Field("text", description="Message type: text, code, suggestion, decision, action_item")
    agent_id: Optional[str] = Field(None, description="Agent ID if message is from an agent")
    sender_name: Optional[str] = Field(None, max_length=100, description="Display name of sender")


# ============================================================================
# Room CRUD
# ============================================================================

@router.post("", summary="Create a collaboration room")
async def create_room(
    req: CreateRoomRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new collaboration room."""
    valid_types = ("discussion", "review", "debugging", "planning")
    if req.room_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid room_type. Must be one of: {', '.join(valid_types)}")

    try:
        rows = await execute_mutate(
            """
            INSERT INTO agent_collaboration_rooms (user_id, name, description, room_type, agent_ids)
            VALUES (:user_id, :name, :description, :room_type, :agent_ids)
            RETURNING id, user_id, name, description, room_type, agent_ids, status, created_at, updated_at
            """,
            {
                "user_id": user_id,
                "name": req.name,
                "description": req.description,
                "room_type": req.room_type,
                "agent_ids": req.agent_ids,
            },
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create room")

        room = rows[0]
        return _format_room(room)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create collaboration room: {e}")
        raise HTTPException(status_code=500, detail="Failed to create room")


@router.get("", summary="List collaboration rooms")
async def list_rooms(
    status: Optional[str] = Query(None, description="Filter by status: active, archived, resolved"),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List collaboration rooms for the current user."""
    try:
        if status:
            valid_statuses = ("active", "archived", "resolved")
            if status not in valid_statuses:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
            rows = await execute(
                """
                SELECT id, user_id, name, description, room_type, agent_ids, status, created_at, updated_at
                FROM agent_collaboration_rooms
                WHERE user_id = :user_id AND status = :status
                ORDER BY updated_at DESC
                LIMIT :limit
                """,
                {"user_id": user_id, "status": status, "limit": limit},
            )
        else:
            rows = await execute(
                """
                SELECT id, user_id, name, description, room_type, agent_ids, status, created_at, updated_at
                FROM agent_collaboration_rooms
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
                LIMIT :limit
                """,
                {"user_id": user_id, "limit": limit},
            )
        return [_format_room(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list collaboration rooms: {e}")
        raise HTTPException(status_code=500, detail="Failed to list rooms")


@router.get("/{room_id}", summary="Get collaboration room detail")
async def get_room(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a collaboration room with its recent messages (last 20)."""
    try:
        room = await execute_one(
            """
            SELECT id, user_id, name, description, room_type, agent_ids, status, created_at, updated_at
            FROM agent_collaboration_rooms
            WHERE id = :room_id AND user_id = :user_id
            """,
            {"room_id": room_id, "user_id": user_id},
        )
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        messages = await execute(
            """
            SELECT id, room_id, user_id, sender_type, sender_name, agent_id, content, message_type, metadata, created_at
            FROM collaboration_messages
            WHERE room_id = :room_id AND user_id = :user_id
            ORDER BY created_at DESC
            LIMIT 20
            """,
            {"room_id": room_id, "user_id": user_id},
        )

        result = _format_room(room)
        result["recent_messages"] = [_format_message(m) for m in reversed(messages)]
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get room")


@router.patch("/{room_id}", summary="Update a collaboration room")
async def update_room(
    room_id: str,
    req: UpdateRoomRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a collaboration room's name, description, status, or agent list."""
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")

    if req.status:
        valid_statuses = ("active", "archived", "resolved")
        if req.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    # Build dynamic update
    updates = []
    params = {"room_id": room_id, "user_id": user_id}

    if req.name is not None:
        updates.append("name = :name")
        params["name"] = req.name
    if req.description is not None:
        updates.append("description = :description")
        params["description"] = req.description
    if req.status is not None:
        updates.append("status = :status")
        params["status"] = req.status
    if req.agent_ids is not None:
        updates.append("agent_ids = :agent_ids")
        params["agent_ids"] = req.agent_ids

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = now()")

    try:
        rows = await execute_mutate(
            f"""
            UPDATE agent_collaboration_rooms
            SET {', '.join(updates)}
            WHERE id = :room_id AND user_id = :user_id
            RETURNING id, user_id, name, description, room_type, agent_ids, status, created_at, updated_at
            """,
            params,
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to update room")
        return _format_room(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update room")


@router.delete("/{room_id}", summary="Delete a collaboration room")
async def delete_room(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a collaboration room and all its messages."""
    existing = await execute_one(
        "SELECT id FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        await execute_mutate(
            "DELETE FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
            {"room_id": room_id, "user_id": user_id},
        )
        return {"deleted": True, "room_id": room_id}
    except Exception as e:
        logger.error(f"Failed to delete collaboration room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete room")


# ============================================================================
# Messages
# ============================================================================

@router.post("/{room_id}/messages", summary="Send a message in a collaboration room")
async def send_message(
    room_id: str,
    req: SendMessageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Send a message in a collaboration room."""
    valid_types = ("text", "code", "suggestion", "decision", "action_item")
    if req.message_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid message_type. Must be one of: {', '.join(valid_types)}")

    # Verify room ownership
    room = await execute_one(
        "SELECT id FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    sender_type = "agent" if req.agent_id else "user"

    try:
        rows = await execute_mutate(
            """
            INSERT INTO collaboration_messages (room_id, user_id, sender_type, sender_name, agent_id, content, message_type, metadata)
            VALUES (:room_id, :user_id, :sender_type, :sender_name, :agent_id, :content, :message_type, :metadata)
            RETURNING id, room_id, user_id, sender_type, sender_name, agent_id, content, message_type, metadata, created_at
            """,
            {
                "room_id": room_id,
                "user_id": user_id,
                "sender_type": sender_type,
                "sender_name": req.sender_name,
                "agent_id": req.agent_id,
                "content": req.content,
                "message_type": req.message_type,
                "metadata": "{}",
            },
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to send message")

        # Update room's updated_at timestamp
        await execute_mutate(
            "UPDATE agent_collaboration_rooms SET updated_at = now() WHERE id = :room_id",
            {"room_id": room_id},
        )

        return _format_message(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send message in room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send message")


@router.get("/{room_id}/messages", summary="List messages in a collaboration room")
async def list_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List messages in a collaboration room with pagination."""
    # Verify room ownership
    room = await execute_one(
        "SELECT id FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        messages = await execute(
            """
            SELECT id, room_id, user_id, sender_type, sender_name, agent_id, content, message_type, metadata, created_at
            FROM collaboration_messages
            WHERE room_id = :room_id AND user_id = :user_id
            ORDER BY created_at ASC
            LIMIT :limit OFFSET :offset
            """,
            {"room_id": room_id, "user_id": user_id, "limit": limit, "offset": offset},
        )
        return [_format_message(m) for m in messages]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list messages for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list messages")


@router.get("/{room_id}/summary", summary="Get room summary")
async def room_summary(
    room_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a summary of a collaboration room: message count, participants, action items, last activity."""
    # Verify room ownership
    room = await execute_one(
        "SELECT id FROM agent_collaboration_rooms WHERE id = :room_id AND user_id = :user_id",
        {"room_id": room_id, "user_id": user_id},
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        stats = await execute_one(
            """
            SELECT
                COUNT(*) as message_count,
                COUNT(DISTINCT COALESCE(sender_name, sender_type)) as unique_participants,
                COUNT(*) FILTER (WHERE message_type = 'action_item') as action_items_count,
                MAX(created_at) as last_activity
            FROM collaboration_messages
            WHERE room_id = :room_id AND user_id = :user_id
            """,
            {"room_id": room_id, "user_id": user_id},
        )

        return {
            "room_id": room_id,
            "message_count": stats["message_count"] if stats else 0,
            "unique_participants": stats["unique_participants"] if stats else 0,
            "action_items_count": stats["action_items_count"] if stats else 0,
            "last_activity": str(stats["last_activity"]) if stats and stats["last_activity"] else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get summary for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get room summary")


# ============================================================================
# Helpers
# ============================================================================

def _format_room(row: dict) -> dict:
    """Format a room row for API response."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "name": row["name"],
        "description": row.get("description"),
        "room_type": row.get("room_type", "discussion"),
        "agent_ids": row.get("agent_ids") or [],
        "status": row.get("status", "active"),
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
        "updated_at": str(row["updated_at"]) if row.get("updated_at") else None,
    }


def _format_message(row: dict) -> dict:
    """Format a message row for API response."""
    return {
        "id": str(row["id"]),
        "room_id": str(row["room_id"]),
        "user_id": str(row["user_id"]),
        "sender_type": row.get("sender_type", "user"),
        "sender_name": row.get("sender_name"),
        "agent_id": row.get("agent_id"),
        "content": row["content"],
        "message_type": row.get("message_type", "text"),
        "metadata": row.get("metadata") or {},
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
    }
