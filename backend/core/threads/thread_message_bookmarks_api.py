"""
Thread Message Bookmarks API.

Bookmark specific messages within threads with labels, notes, and color coding.
Supports organizing bookmarks into collections.
"""

from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

# Main router: thread-scoped bookmark endpoints
router = APIRouter(tags=["thread-message-bookmarks"])

# Separate router for non-thread-scoped endpoints
bookmarks_router = APIRouter(tags=["thread-message-bookmarks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateMessageBookmarkRequest(BaseModel):
    message_index: int = Field(..., ge=0)
    bookmark_label: Optional[str] = Field(None, max_length=200)
    bookmark_note: Optional[str] = Field(None, max_length=2000)
    bookmark_color: str = Field(default="#f59e0b", max_length=20)


class UpdateMessageBookmarkRequest(BaseModel):
    bookmark_label: Optional[str] = Field(None, max_length=200)
    bookmark_note: Optional[str] = Field(None, max_length=2000)
    bookmark_color: Optional[str] = Field(None, max_length=20)


class CreateBookmarkCollectionRequest(BaseModel):
    collection_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    bookmark_ids: List[str] = Field(default_factory=list)


class UpdateBookmarkCollectionRequest(BaseModel):
    collection_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    bookmark_ids: Optional[List[str]] = None


# ============================================================================
# Thread Message Bookmark Endpoints  (prefix: /threads)
# ============================================================================

@router.post(
    "/threads/{thread_id}/bookmarks",
    summary="Bookmark a message in a thread",
    operation_id="create_message_bookmark",
)
async def create_message_bookmark(
    thread_id: str,
    body: CreateMessageBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Bookmark a specific message in a thread by its index."""
    try:
        row = await execute_one(
            """
            INSERT INTO thread_message_bookmarks (
                user_id, thread_id, message_index,
                bookmark_label, bookmark_note, bookmark_color
            ) VALUES (
                :user_id, :thread_id, :message_index,
                :bookmark_label, :bookmark_note, :bookmark_color
            )
            ON CONFLICT (user_id, thread_id, message_index) DO UPDATE SET
                bookmark_label = EXCLUDED.bookmark_label,
                bookmark_note = EXCLUDED.bookmark_note,
                bookmark_color = EXCLUDED.bookmark_color
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "message_index": body.message_index,
                "bookmark_label": body.bookmark_label,
                "bookmark_note": body.bookmark_note,
                "bookmark_color": body.bookmark_color,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create bookmark")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating message bookmark for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create bookmark")


@router.get(
    "/threads/{thread_id}/bookmarks",
    summary="List bookmarks for a thread",
    operation_id="list_thread_message_bookmarks",
)
async def list_thread_message_bookmarks(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all message bookmarks for a specific thread."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_message_bookmarks
            WHERE user_id = :user_id AND thread_id = :thread_id
            ORDER BY message_index ASC
            """,
            {"user_id": user_id, "thread_id": thread_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing message bookmarks for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list bookmarks")


# ============================================================================
# Bookmark endpoints (no thread-scope prefix)
# ============================================================================

@bookmarks_router.patch(
    "/bookmarks/{bookmark_id}",
    summary="Update a message bookmark",
    operation_id="update_message_bookmark",
)
async def update_message_bookmark(
    bookmark_id: str,
    body: UpdateMessageBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a message bookmark's label, note, or color."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_message_bookmarks WHERE id = :id AND user_id = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        updates: Dict[str, Any] = {}
        params: Dict[str, Any] = {"id": bookmark_id, "user_id": user_id}

        if body.bookmark_label is not None:
            updates["bookmark_label"] = body.bookmark_label
            params["bookmark_label"] = body.bookmark_label
        if body.bookmark_note is not None:
            updates["bookmark_note"] = body.bookmark_note
            params["bookmark_note"] = body.bookmark_note
        if body.bookmark_color is not None:
            updates["bookmark_color"] = body.bookmark_color
            params["bookmark_color"] = body.bookmark_color

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        row = await execute_one(
            f"UPDATE thread_message_bookmarks SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating message bookmark {bookmark_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update bookmark")


@bookmarks_router.delete(
    "/bookmarks/{bookmark_id}",
    summary="Delete a message bookmark",
    operation_id="delete_message_bookmark",
)
async def delete_message_bookmark(
    bookmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific message bookmark."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_message_bookmarks WHERE id = :id AND user_id = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        await execute_mutate(
            "DELETE FROM thread_message_bookmarks WHERE id = :id AND user_id = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting message bookmark {bookmark_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete bookmark")


@bookmarks_router.get(
    "/bookmarks",
    summary="List all message bookmarks for user",
    operation_id="list_all_message_bookmarks",
)
async def list_all_message_bookmarks(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all message bookmarks across all threads for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_message_bookmarks
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )
        count_row = await execute_one(
            "SELECT COUNT(*) AS total FROM thread_message_bookmarks WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        return {
            "bookmarks": serialize_rows(rows) if rows else [],
            "total": int(count_row["total"] or 0) if count_row else 0,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Error listing all message bookmarks for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list bookmarks")


# ============================================================================
# Bookmark Collection Endpoints
# ============================================================================

@bookmarks_router.post(
    "/bookmark-collections",
    summary="Create a bookmark collection",
    operation_id="create_bookmark_collection",
)
async def create_bookmark_collection(
    body: CreateBookmarkCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new bookmark collection."""
    try:
        row = await execute_one(
            """
            INSERT INTO bookmark_collections (user_id, collection_name, description, bookmark_ids)
            VALUES (:user_id, :collection_name, :description, :bookmark_ids)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "collection_name": body.collection_name.strip(),
                "description": body.description,
                "bookmark_ids": body.bookmark_ids,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create collection")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bookmark collection for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create collection")


@bookmarks_router.get(
    "/bookmark-collections",
    summary="List bookmark collections",
    operation_id="list_bookmark_collections",
)
async def list_bookmark_collections(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all bookmark collections for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM bookmark_collections
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing bookmark collections for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list collections")


@bookmarks_router.patch(
    "/bookmark-collections/{collection_id}",
    summary="Update a bookmark collection",
    operation_id="update_bookmark_collection",
)
async def update_bookmark_collection(
    collection_id: str,
    body: UpdateBookmarkCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a bookmark collection's name, description, or bookmark list."""
    try:
        existing = await execute_one(
            "SELECT id FROM bookmark_collections WHERE id = :id AND user_id = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Collection not found")

        updates: Dict[str, Any] = {}
        params: Dict[str, Any] = {"id": collection_id, "user_id": user_id}

        if body.collection_name is not None:
            updates["collection_name"] = body.collection_name.strip()
            params["collection_name"] = body.collection_name.strip()
        if body.description is not None:
            updates["description"] = body.description
            params["description"] = body.description
        if body.bookmark_ids is not None:
            updates["bookmark_ids"] = body.bookmark_ids
            params["bookmark_ids"] = body.bookmark_ids

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        row = await execute_one(
            f"UPDATE bookmark_collections SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bookmark collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update collection")


@bookmarks_router.delete(
    "/bookmark-collections/{collection_id}",
    summary="Delete a bookmark collection",
    operation_id="delete_bookmark_collection",
)
async def delete_bookmark_collection(
    collection_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a bookmark collection."""
    try:
        existing = await execute_one(
            "SELECT id FROM bookmark_collections WHERE id = :id AND user_id = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Collection not found")

        await execute_mutate(
            "DELETE FROM bookmark_collections WHERE id = :id AND user_id = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bookmark collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collection")
