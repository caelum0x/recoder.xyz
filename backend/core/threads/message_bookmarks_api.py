from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["message-bookmarks"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateBookmarkRequest(BaseModel):
    thread_id: str
    message_index: int
    message_preview: Optional[str] = None
    note: Optional[str] = None


class UpdateBookmarkNoteRequest(BaseModel):
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Bookmark endpoints
# ---------------------------------------------------------------------------

@router.post("/bookmarks", summary="Create a message bookmark")
async def create_bookmark(
    body: CreateBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.message_index < 0:
        raise HTTPException(status_code=400, detail="message_index must be >= 0")

    try:
        row = await execute_one(
            """
            INSERT INTO message_bookmarks (user_id, thread_id, message_index, message_preview, note)
            VALUES (:user_id, :thread_id, :message_index, :message_preview, :note)
            ON CONFLICT (user_id, thread_id, message_index)
            DO UPDATE SET
                message_preview = COALESCE(EXCLUDED.message_preview, message_bookmarks.message_preview),
                note = COALESCE(EXCLUDED.note, message_bookmarks.note)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": body.thread_id,
                "message_index": body.message_index,
                "message_preview": body.message_preview,
                "note": body.note,
            },
        )
        return dict(row)
    except Exception as e:
        logger.error(f"Failed to create bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to create bookmark")


@router.get("/bookmarks", summary="List bookmarks")
async def list_bookmarks(
    thread_id: Optional[str] = Query(None, description="Filter by thread ID"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if thread_id:
        rows = await execute(
            """
            SELECT * FROM message_bookmarks
            WHERE user_id = :user_id AND thread_id = :thread_id
            ORDER BY message_index ASC
            """,
            {"user_id": user_id, "thread_id": thread_id},
        )
    else:
        rows = await execute(
            """
            SELECT * FROM message_bookmarks
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
    return [dict(r) for r in rows]


@router.delete("/bookmarks/{bookmark_id}", summary="Delete a bookmark")
async def delete_bookmark(
    bookmark_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM message_bookmarks WHERE id = :id AND user_id = :user_id",
        {"id": bookmark_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    await execute(
        "DELETE FROM message_bookmarks WHERE id = :id AND user_id = :user_id",
        {"id": bookmark_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.patch("/bookmarks/{bookmark_id}", summary="Update bookmark note")
async def update_bookmark_note(
    bookmark_id: str,
    body: UpdateBookmarkNoteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM message_bookmarks WHERE id = :id AND user_id = :user_id",
        {"id": bookmark_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    row = await execute_one(
        """
        UPDATE message_bookmarks
        SET note = :note
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": bookmark_id, "user_id": user_id, "note": body.note},
    )
    return dict(row)
