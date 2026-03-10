"""
Thread Pinned Messages API endpoints.

Allows users to pin individual messages within threads with optional notes
and color labels. Access control enforced at application layer (WHERE user_id = :user_id).
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["pinned-messages"])


# ============================================================================
# Pydantic Models
# ============================================================================

class PinMessageRequest(BaseModel):
    message_index: int = Field(..., ge=0)
    message_preview: Optional[str] = Field(None, max_length=500)
    pin_note: Optional[str] = Field(None, max_length=500)
    pin_color: str = Field(default="default")


class UpdatePinRequest(BaseModel):
    pin_note: Optional[str] = Field(None, max_length=500)
    pin_color: Optional[str] = None


class PinnedMessageResponse(BaseModel):
    id: str
    user_id: str
    thread_id: str
    message_index: int
    message_preview: Optional[str] = None
    pin_note: Optional[str] = None
    pin_color: str = "default"
    pinned_at: str


# ============================================================================
# Helpers
# ============================================================================

VALID_PIN_COLORS = {"default", "important", "reference", "todo"}


def _row_to_pin(row: dict) -> dict:
    """Convert a DB row to a serializable pinned message dict."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "thread_id": row["thread_id"],
        "message_index": row["message_index"],
        "message_preview": row.get("message_preview"),
        "pin_note": row.get("pin_note"),
        "pin_color": row.get("pin_color", "default"),
        "pinned_at": row["pinned_at"].isoformat() if row.get("pinned_at") else "",
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/threads/{thread_id}/pins", summary="Pin a message in a thread")
async def pin_message(
    thread_id: str,
    body: PinMessageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Pin a message in a thread. Upserts on (user_id, thread_id, message_index)."""
    if body.pin_color not in VALID_PIN_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid pin_color. Must be one of: {', '.join(VALID_PIN_COLORS)}")

    try:
        pin_id = str(uuid.uuid4())
        await execute_mutate(
            """
            INSERT INTO thread_pinned_messages (id, user_id, thread_id, message_index, message_preview, pin_note, pin_color)
            VALUES (:id, :user_id, :thread_id, :message_index, :message_preview, :pin_note, :pin_color)
            ON CONFLICT (user_id, thread_id, message_index) DO UPDATE SET
                message_preview = COALESCE(EXCLUDED.message_preview, thread_pinned_messages.message_preview),
                pin_note = EXCLUDED.pin_note,
                pin_color = EXCLUDED.pin_color,
                pinned_at = now()
            """,
            {
                "id": pin_id,
                "user_id": user_id,
                "thread_id": thread_id,
                "message_index": body.message_index,
                "message_preview": body.message_preview,
                "pin_note": body.pin_note,
                "pin_color": body.pin_color,
            },
        )

        # Fetch the actual row (might be the upserted one with a different id)
        row = await execute_one(
            """
            SELECT * FROM thread_pinned_messages
            WHERE user_id = :user_id AND thread_id = :thread_id AND message_index = :message_index
            """,
            {"user_id": user_id, "thread_id": thread_id, "message_index": body.message_index},
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to pin message")

        return _row_to_pin(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[pinned-messages] Failed to pin message in thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to pin message")


@router.get("/threads/{thread_id}/pins", summary="List pinned messages for a thread")
async def list_pinned_messages(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all pinned messages for a specific thread."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_pinned_messages
            WHERE user_id = :user_id AND thread_id = :thread_id
            ORDER BY pinned_at DESC
            """,
            {"user_id": user_id, "thread_id": thread_id},
        )
        return [_row_to_pin(r) for r in (rows or [])]
    except Exception as e:
        logger.error(f"[pinned-messages] Failed to list pins for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pinned messages")


@router.delete("/threads/{thread_id}/pins/{pin_id}", summary="Unpin a message")
async def unpin_message(
    thread_id: str,
    pin_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a pin from a message."""
    existing = await execute_one(
        "SELECT id FROM thread_pinned_messages WHERE id = :id AND user_id = :user_id AND thread_id = :thread_id",
        {"id": pin_id, "user_id": user_id, "thread_id": thread_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pin not found")

    try:
        await execute_mutate(
            "DELETE FROM thread_pinned_messages WHERE id = :id AND user_id = :user_id",
            {"id": pin_id, "user_id": user_id},
        )
        return {"status": "unpinned"}
    except Exception as e:
        logger.error(f"[pinned-messages] Failed to unpin {pin_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to unpin message")


@router.patch("/threads/{thread_id}/pins/{pin_id}", summary="Update pin note or color")
async def update_pin(
    thread_id: str,
    pin_id: str,
    body: UpdatePinRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update the note or color of an existing pin."""
    existing = await execute_one(
        "SELECT id FROM thread_pinned_messages WHERE id = :id AND user_id = :user_id AND thread_id = :thread_id",
        {"id": pin_id, "user_id": user_id, "thread_id": thread_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pin not found")

    if body.pin_color and body.pin_color not in VALID_PIN_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid pin_color. Must be one of: {', '.join(VALID_PIN_COLORS)}")

    try:
        updates = []
        params: Dict[str, Any] = {"id": pin_id, "user_id": user_id}

        update_data = body.model_dump(exclude_none=True)
        if "pin_note" in update_data:
            updates.append("pin_note = :pin_note")
            params["pin_note"] = update_data["pin_note"]
        if "pin_color" in update_data:
            updates.append("pin_color = :pin_color")
            params["pin_color"] = update_data["pin_color"]

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(updates)
        await execute_mutate(
            f"UPDATE thread_pinned_messages SET {set_clause} WHERE id = :id AND user_id = :user_id",
            params,
        )

        row = await execute_one(
            "SELECT * FROM thread_pinned_messages WHERE id = :id AND user_id = :user_id",
            {"id": pin_id, "user_id": user_id},
        )
        return _row_to_pin(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[pinned-messages] Failed to update pin {pin_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update pin")


@router.get("/pins/recent", summary="Recent pins across all threads")
async def recent_pins(
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get recent pins across all threads for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_pinned_messages
            WHERE user_id = :user_id
            ORDER BY pinned_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
        return [_row_to_pin(r) for r in (rows or [])]
    except Exception as e:
        logger.error(f"[pinned-messages] Failed to get recent pins: {e}")
        raise HTTPException(status_code=500, detail="Failed to get recent pins")
