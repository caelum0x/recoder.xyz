"""
Thread Pinning API.

Provides pin management (pin/unpin threads, label/note/color/reorder) and
pin collections for grouping pinned threads together.

Endpoints:
  POST   /threads/{thread_id}/pin
  DELETE /threads/{thread_id}/pin
  GET    /pinned-threads
  PATCH  /pinned-threads/{pin_id}
  POST   /pinned-threads/reorder
  POST   /pin-collections
  GET    /pin-collections
  PATCH  /pin-collections/{collection_id}
  DELETE /pin-collections/{collection_id}
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

# Two routers: one for /threads/* paths, one for top-level /pinned-threads and /pin-collections
router = APIRouter(tags=["thread-pinning"])


# ============================================================================
# Pydantic Models
# ============================================================================

class PinThreadRequest(BaseModel):
    pin_label: Optional[str] = Field(None, max_length=200, description="Short label for the pin")
    pin_note: Optional[str] = Field(None, max_length=1000, description="Optional note")
    pin_color: Optional[str] = Field("#6366f1", description="Hex color for visual indicator")


class UpdatePinRequest(BaseModel):
    pin_label: Optional[str] = Field(None, max_length=200)
    pin_note: Optional[str] = Field(None, max_length=1000)
    pin_color: Optional[str] = None


class ReorderPinsRequest(BaseModel):
    pin_ids: List[str] = Field(..., description="Ordered pin UUIDs — position sets display_order")


class CreateCollectionRequest(BaseModel):
    collection_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    thread_ids: Optional[List[str]] = Field(default_factory=list)
    is_shared: bool = Field(False)


class UpdateCollectionRequest(BaseModel):
    collection_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    thread_ids: Optional[List[str]] = None
    is_shared: Optional[bool] = None


# ============================================================================
# Pin Endpoints: /threads/{thread_id}/pin
# ============================================================================

@router.post(
    "/threads/{thread_id}/pin",
    summary="Pin a thread",
    operation_id="pin_thread",
)
async def pin_thread(
    thread_id: str,
    body: PinThreadRequest = PinThreadRequest(),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Pin a thread with optional label, note, and color."""
    try:
        max_row = await execute_one(
            "SELECT COALESCE(MAX(display_order), -1) AS max_ord FROM pinned_threads WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )
        next_order = (max_row["max_ord"] + 1) if max_row else 0

        row = await execute_one(
            """
            INSERT INTO pinned_threads (user_id, thread_id, pin_label, pin_note, pin_color, display_order)
            VALUES (:user_id, :thread_id, :pin_label, :pin_note, :pin_color, :display_order)
            ON CONFLICT (user_id, thread_id) DO UPDATE
              SET pin_label = EXCLUDED.pin_label,
                  pin_note = EXCLUDED.pin_note,
                  pin_color = EXCLUDED.pin_color
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "pin_label": body.pin_label,
                "pin_note": body.pin_note,
                "pin_color": body.pin_color or "#6366f1",
                "display_order": next_order,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error pinning thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to pin thread")


@router.delete(
    "/threads/{thread_id}/pin",
    summary="Unpin a thread",
    operation_id="unpin_thread",
)
async def unpin_thread(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a thread pin."""
    existing = await execute_one(
        "SELECT id FROM pinned_threads WHERE user_id::text = :user_id AND thread_id::text = :thread_id",
        {"user_id": user_id, "thread_id": thread_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pin not found")

    try:
        await execute_mutate(
            "DELETE FROM pinned_threads WHERE user_id::text = :user_id AND thread_id::text = :thread_id",
            {"user_id": user_id, "thread_id": thread_id},
        )
        return {"deleted": True, "thread_id": thread_id}
    except Exception as e:
        logger.error(f"Error unpinning thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to unpin thread")


# ============================================================================
# Pin List + Reorder Endpoints: /pinned-threads/*
# ============================================================================

@router.get(
    "/pinned-threads",
    summary="List pinned threads",
    operation_id="list_pinned_threads",
)
async def list_pinned_threads(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all pinned threads for the user, ordered by display_order."""
    try:
        rows = await execute(
            """
            SELECT * FROM pinned_threads
            WHERE user_id::text = :user_id
            ORDER BY display_order ASC, created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing pinned threads: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pinned threads")


@router.post(
    "/pinned-threads/reorder",
    summary="Reorder pinned threads",
    operation_id="reorder_pinned_threads",
)
async def reorder_pins(
    body: ReorderPinsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reorder pinned threads. Position in pin_ids list sets display_order (0-indexed)."""
    try:
        for idx, pin_id in enumerate(body.pin_ids):
            await execute_mutate(
                """
                UPDATE pinned_threads
                SET display_order = :display_order
                WHERE id = :pin_id AND user_id::text = :user_id
                """,
                {"display_order": idx, "pin_id": pin_id, "user_id": user_id},
            )
        return {"reordered": True, "count": len(body.pin_ids)}
    except Exception as e:
        logger.error(f"Error reordering pins: {e}")
        raise HTTPException(status_code=500, detail="Failed to reorder pins")


@router.patch(
    "/pinned-threads/{pin_id}",
    summary="Update a thread pin",
    operation_id="update_thread_pin",
)
async def update_pin(
    pin_id: str,
    body: UpdatePinRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a thread pin's label, note, or color."""
    existing = await execute_one(
        "SELECT id FROM pinned_threads WHERE id = :pin_id AND user_id::text = :user_id",
        {"pin_id": pin_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pin not found")

    updates = []
    params: Dict[str, Any] = {"pin_id": pin_id, "user_id": user_id}

    if body.pin_label is not None:
        updates.append("pin_label = :pin_label")
        params["pin_label"] = body.pin_label
    if body.pin_note is not None:
        updates.append("pin_note = :pin_note")
        params["pin_note"] = body.pin_note
    if body.pin_color is not None:
        updates.append("pin_color = :pin_color")
        params["pin_color"] = body.pin_color

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        row = await execute_one(
            f"""
            UPDATE pinned_threads
            SET {', '.join(updates)}
            WHERE id = :pin_id AND user_id::text = :user_id
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
        logger.error(f"Error updating pin {pin_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update pin")


# ============================================================================
# Collection Endpoints: /pin-collections/*
# ============================================================================

@router.post(
    "/pin-collections",
    summary="Create pin collection",
    operation_id="create_pin_collection",
)
async def create_collection(
    body: CreateCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a named collection of pinned threads."""
    try:
        row = await execute_one(
            """
            INSERT INTO thread_pin_collections (
                user_id, collection_name, description, thread_ids, is_shared
            ) VALUES (
                :user_id, :collection_name, :description, :thread_ids, :is_shared
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "collection_name": body.collection_name,
                "description": body.description,
                "thread_ids": body.thread_ids or [],
                "is_shared": body.is_shared,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating pin collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to create pin collection")


@router.get(
    "/pin-collections",
    summary="List pin collections",
    operation_id="list_pin_collections",
)
async def list_collections(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List pin collections for the user."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_pin_collections
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing pin collections: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pin collections")


@router.patch(
    "/pin-collections/{collection_id}",
    summary="Update pin collection",
    operation_id="update_pin_collection",
)
async def update_collection(
    collection_id: str,
    body: UpdateCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a pin collection's name, description, thread list, or shared flag."""
    existing = await execute_one(
        "SELECT id FROM thread_pin_collections WHERE id = :collection_id AND user_id::text = :user_id",
        {"collection_id": collection_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Collection not found")

    updates = []
    params: Dict[str, Any] = {"collection_id": collection_id, "user_id": user_id}

    if body.collection_name is not None:
        updates.append("collection_name = :collection_name")
        params["collection_name"] = body.collection_name
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if body.thread_ids is not None:
        updates.append("thread_ids = :thread_ids")
        params["thread_ids"] = body.thread_ids
    if body.is_shared is not None:
        updates.append("is_shared = :is_shared")
        params["is_shared"] = body.is_shared

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        row = await execute_one(
            f"""
            UPDATE thread_pin_collections
            SET {', '.join(updates)}
            WHERE id = :collection_id AND user_id::text = :user_id
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
        logger.error(f"Error updating pin collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update collection")


@router.delete(
    "/pin-collections/{collection_id}",
    summary="Delete pin collection",
    operation_id="delete_pin_collection",
)
async def delete_collection(
    collection_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a pin collection (does not unpin threads)."""
    existing = await execute_one(
        "SELECT id FROM thread_pin_collections WHERE id = :collection_id AND user_id::text = :user_id",
        {"collection_id": collection_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Collection not found")

    try:
        await execute_mutate(
            "DELETE FROM thread_pin_collections WHERE id = :collection_id AND user_id::text = :user_id",
            {"collection_id": collection_id, "user_id": user_id},
        )
        return {"deleted": True, "collection_id": collection_id}
    except Exception as e:
        logger.error(f"Error deleting pin collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collection")
