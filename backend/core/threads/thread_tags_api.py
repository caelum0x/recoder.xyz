from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["thread-tags"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateTagRequest(BaseModel):
    name: str
    color: Optional[str] = "#6b7280"


class UpdateTagRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class AssignTagRequest(BaseModel):
    tag_id: str


class BulkTagRequest(BaseModel):
    thread_ids: List[str]
    tag_id: str


# ---------------------------------------------------------------------------
# Tag CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("/tags", summary="Create a tag")
async def create_tag(
    body: CreateTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Tag name is required")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_tags (user_id, name, color)
            VALUES (:user_id, :name, :color)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "color": body.color or "#6b7280",
            },
        )
        return dict(row)
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A tag with this name already exists")
        raise


@router.get("/tags", summary="List user tags with thread count")
async def list_tags(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT t.*, COALESCE(c.thread_count, 0) AS thread_count
        FROM thread_tags t
        LEFT JOIN (
            SELECT tag_id, COUNT(*) AS thread_count
            FROM thread_tag_assignments
            WHERE user_id = :user_id
            GROUP BY tag_id
        ) c ON c.tag_id = t.id
        WHERE t.user_id = :user_id
        ORDER BY t.name
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.patch("/tags/{tag_id}", summary="Update a tag")
async def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_tags WHERE id = :id AND user_id = :user_id",
        {"id": tag_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    updates = {}
    params = {"id": tag_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name.strip()
        params["name"] = body.name.strip()
    if body.color is not None:
        updates["color"] = body.color
        params["color"] = body.color

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    try:
        row = await execute_one(
            f"UPDATE thread_tags SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        return dict(row)
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A tag with this name already exists")
        raise


@router.delete("/tags/{tag_id}", summary="Delete a tag (cascade)")
async def delete_tag(
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_tags WHERE id = :id AND user_id = :user_id",
        {"id": tag_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    await execute(
        "DELETE FROM thread_tags WHERE id = :id AND user_id = :user_id",
        {"id": tag_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Tag assignment endpoints
# ---------------------------------------------------------------------------

@router.post("/threads/{thread_id}/tags", summary="Assign tag to thread")
async def assign_tag(
    thread_id: str,
    body: AssignTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify the tag belongs to the user
    tag = await execute_one(
        "SELECT id FROM thread_tags WHERE id = :tag_id AND user_id = :user_id",
        {"tag_id": body.tag_id, "user_id": user_id},
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_tag_assignments (thread_id, tag_id, user_id)
            VALUES (:thread_id, :tag_id, :user_id)
            ON CONFLICT (thread_id, tag_id) DO NOTHING
            RETURNING *
            """,
            {
                "thread_id": thread_id,
                "tag_id": body.tag_id,
                "user_id": user_id,
            },
        )
        return {"status": "ok", "assignment": dict(row) if row else None}
    except Exception:
        return {"status": "ok", "assignment": None}


@router.delete("/threads/{thread_id}/tags/{tag_id}", summary="Remove tag from thread")
async def remove_tag(
    thread_id: str,
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        """
        DELETE FROM thread_tag_assignments
        WHERE thread_id = :thread_id AND tag_id = :tag_id AND user_id = :user_id
        """,
        {"thread_id": thread_id, "tag_id": tag_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.get("/threads/{thread_id}/tags", summary="List tags on a thread")
async def list_thread_tags(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT t.*
        FROM thread_tags t
        JOIN thread_tag_assignments a ON a.tag_id = t.id
        WHERE a.thread_id = :thread_id AND a.user_id = :user_id
        ORDER BY t.name
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.get("/tags/{tag_id}/threads", summary="List threads with a specific tag")
async def list_tagged_threads(
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT a.thread_id, a.assigned_at
        FROM thread_tag_assignments a
        WHERE a.tag_id = :tag_id AND a.user_id = :user_id
        ORDER BY a.assigned_at DESC
        """,
        {"tag_id": tag_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.post("/threads/bulk-tag", summary="Assign tag to multiple threads")
async def bulk_tag(
    body: BulkTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify the tag belongs to the user
    tag = await execute_one(
        "SELECT id FROM thread_tags WHERE id = :tag_id AND user_id = :user_id",
        {"tag_id": body.tag_id, "user_id": user_id},
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    assigned = 0
    for thread_id in body.thread_ids:
        try:
            result = await execute_one(
                """
                INSERT INTO thread_tag_assignments (thread_id, tag_id, user_id)
                VALUES (:thread_id, :tag_id, :user_id)
                ON CONFLICT (thread_id, tag_id) DO NOTHING
                RETURNING thread_id
                """,
                {
                    "thread_id": thread_id,
                    "tag_id": body.tag_id,
                    "user_id": user_id,
                },
            )
            if result:
                assigned += 1
        except Exception as e:
            logger.warning(f"Failed to assign tag to thread {thread_id}: {e}")

    return {"status": "ok", "assigned": assigned, "total": len(body.thread_ids)}
