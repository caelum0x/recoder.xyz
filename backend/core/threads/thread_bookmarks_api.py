"""
Thread Bookmarks & Collections API.

Bookmark threads into organized collections for quick access.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["thread-bookmarks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateCollectionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = "#6366f1"
    icon: Optional[str] = "bookmark"


class UpdateCollectionRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None


class CreateBookmarkRequest(BaseModel):
    thread_id: str = Field(..., min_length=1)
    collection_id: Optional[str] = None
    note: Optional[str] = None


class UpdateBookmarkRequest(BaseModel):
    note: Optional[str] = None
    collection_id: Optional[str] = None


# ============================================================================
# Collection Endpoints
# ============================================================================

@router.post("/bookmarks/collections", summary="Create bookmark collection")
async def create_collection(
    body: CreateCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new bookmark collection."""
    try:
        # Get next sort_order
        max_row = await execute_one(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM thread_bookmark_collections WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )
        next_order = max_row["next_order"] if max_row else 0

        row = await execute_one(
            """INSERT INTO thread_bookmark_collections (user_id, name, description, color, icon, sort_order)
               VALUES (:user_id, :name, :description, :color, :icon, :sort_order)
               RETURNING *""",
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "description": body.description,
                "color": body.color or "#6366f1",
                "icon": body.icon or "bookmark",
                "sort_order": next_order,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create collection")
        return dict(row)

    except Exception as e:
        logger.error(f"Error creating bookmark collection: {e}")
        raise HTTPException(status_code=500, detail="Failed to create collection")


@router.get("/bookmarks/collections", summary="List bookmark collections")
async def list_collections(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all bookmark collections with bookmark counts."""
    try:
        rows = await execute(
            """SELECT c.*, COALESCE(bc.bookmark_count, 0) AS bookmark_count
               FROM thread_bookmark_collections c
               LEFT JOIN (
                   SELECT collection_id, COUNT(*) AS bookmark_count
                   FROM thread_bookmarks
                   WHERE user_id::text = :user_id
                   GROUP BY collection_id
               ) bc ON bc.collection_id::text = c.id::text
               WHERE c.user_id::text = :user_id
               ORDER BY c.sort_order, c.name""",
            {"user_id": user_id},
        )
        return [dict(r) for r in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing bookmark collections: {e}")
        raise HTTPException(status_code=500, detail="Failed to list collections")


@router.patch("/bookmarks/collections/{collection_id}", summary="Update bookmark collection")
async def update_collection(
    collection_id: str,
    body: UpdateCollectionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a bookmark collection's properties."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_bookmark_collections WHERE id = :id AND user_id::text = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Collection not found")

        updates = {}
        params: Dict[str, Any] = {"id": collection_id, "user_id": user_id}

        if body.name is not None:
            updates["name"] = body.name.strip()
            params["name"] = body.name.strip()
        if body.description is not None:
            updates["description"] = body.description
            params["description"] = body.description
        if body.color is not None:
            updates["color"] = body.color
            params["color"] = body.color
        if body.icon is not None:
            updates["icon"] = body.icon
            params["icon"] = body.icon
        if body.sort_order is not None:
            updates["sort_order"] = body.sort_order
            params["sort_order"] = body.sort_order

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        row = await execute_one(
            f"UPDATE thread_bookmark_collections SET {set_clauses} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
        )
        return dict(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update collection")


@router.delete("/bookmarks/collections/{collection_id}", summary="Delete bookmark collection")
async def delete_collection(
    collection_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a collection. Bookmarks in it become uncollected (collection_id set to NULL via FK cascade)."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_bookmark_collections WHERE id = :id AND user_id::text = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Collection not found")

        await execute(
            "DELETE FROM thread_bookmark_collections WHERE id = :id AND user_id::text = :user_id",
            {"id": collection_id, "user_id": user_id},
        )
        return {"status": "ok"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting collection {collection_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collection")


# ============================================================================
# Bookmark Endpoints
# ============================================================================

@router.post("/bookmarks/threads", summary="Bookmark a thread")
async def create_thread_bookmark(
    body: CreateBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Bookmark a thread. Upserts — if already bookmarked, updates collection/note."""
    try:
        # Validate collection_id if provided
        if body.collection_id:
            coll = await execute_one(
                "SELECT id FROM thread_bookmark_collections WHERE id = :id AND user_id::text = :user_id",
                {"id": body.collection_id, "user_id": user_id},
            )
            if not coll:
                raise HTTPException(status_code=404, detail="Collection not found")

        row = await execute_one(
            """INSERT INTO thread_bookmarks (user_id, thread_id, collection_id, note)
               VALUES (:user_id, :thread_id, :collection_id, :note)
               ON CONFLICT (user_id, thread_id) DO UPDATE SET
                   collection_id = EXCLUDED.collection_id,
                   note = EXCLUDED.note
               RETURNING *""",
            {
                "user_id": user_id,
                "thread_id": body.thread_id,
                "collection_id": body.collection_id,
                "note": body.note,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create bookmark")
        return dict(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating thread bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to bookmark thread")


@router.get("/bookmarks/threads", summary="List thread bookmarks")
async def list_thread_bookmarks(
    collection_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List bookmarked threads, optionally filtered by collection."""
    try:
        where_clauses = ["b.user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id}

        if collection_id and collection_id != "all":
            if collection_id == "uncollected":
                where_clauses.append("b.collection_id IS NULL")
            else:
                where_clauses.append("b.collection_id::text = :collection_id")
                params["collection_id"] = collection_id

        where_sql = " AND ".join(where_clauses)
        params["limit"] = limit
        params["offset"] = offset

        rows = await execute(
            f"""SELECT b.*, c.name as collection_name, c.color as collection_color
                FROM thread_bookmarks b
                LEFT JOIN thread_bookmark_collections c ON c.id::text = b.collection_id::text
                WHERE {where_sql}
                ORDER BY b.created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        count_rows = await execute(
            f"SELECT COUNT(*) FROM thread_bookmarks b WHERE {' AND '.join(where_clauses)}",
            {k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
        total = count_rows[0]["count"] if count_rows else 0

        return {
            "bookmarks": [dict(r) for r in (rows or [])],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except Exception as e:
        logger.error(f"Error listing thread bookmarks: {e}")
        raise HTTPException(status_code=500, detail="Failed to list bookmarks")


@router.delete("/bookmarks/threads/{bookmark_id}", summary="Remove thread bookmark")
async def delete_thread_bookmark(
    bookmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a thread bookmark."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_bookmarks WHERE id = :id AND user_id::text = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        await execute(
            "DELETE FROM thread_bookmarks WHERE id = :id AND user_id::text = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        return {"status": "ok"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bookmark {bookmark_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete bookmark")


@router.patch("/bookmarks/threads/{bookmark_id}", summary="Update thread bookmark")
async def update_thread_bookmark(
    bookmark_id: str,
    body: UpdateBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a bookmark's note or move it to a different collection."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_bookmarks WHERE id = :id AND user_id::text = :user_id",
            {"id": bookmark_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Bookmark not found")

        updates = {}
        params: Dict[str, Any] = {"id": bookmark_id, "user_id": user_id}

        if body.note is not None:
            updates["note"] = body.note
            params["note"] = body.note

        if body.collection_id is not None:
            if body.collection_id == "":
                # Remove from collection
                updates["collection_id"] = None
                params["collection_id"] = None
            else:
                # Validate collection
                coll = await execute_one(
                    "SELECT id FROM thread_bookmark_collections WHERE id = :coll_id AND user_id::text = :user_id",
                    {"coll_id": body.collection_id, "user_id": user_id},
                )
                if not coll:
                    raise HTTPException(status_code=404, detail="Collection not found")
                updates["collection_id"] = body.collection_id
                params["collection_id"] = body.collection_id

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        row = await execute_one(
            f"UPDATE thread_bookmarks SET {set_clauses} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
        )
        return dict(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bookmark {bookmark_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update bookmark")
