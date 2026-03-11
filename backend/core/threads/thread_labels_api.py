"""API routes for hierarchical thread labels — organize threads with nested labels."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-labels"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateLabelRequest(BaseModel):
    name: str
    color: Optional[str] = "#6366f1"
    parent_id: Optional[str] = None


class UpdateLabelRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None


class AssignLabelRequest(BaseModel):
    label_id: str


# ---------------------------------------------------------------------------
# Helper: build tree from flat rows
# ---------------------------------------------------------------------------

def _build_label_tree(rows: List[dict]) -> List[dict]:
    """Convert a flat list of label rows into a nested tree structure."""
    by_id = {}
    for r in rows:
        r["children"] = []
        by_id[str(r["id"])] = r

    roots = []
    for r in rows:
        pid = str(r["parent_id"]) if r.get("parent_id") else None
        if pid and pid in by_id:
            by_id[pid]["children"].append(r)
        else:
            roots.append(r)

    return roots


# ---------------------------------------------------------------------------
# Label CRUD
# ---------------------------------------------------------------------------

@router.post("/thread-labels", summary="Create a label")
async def create_label(
    body: CreateLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Label name is required")

    # Validate parent_id belongs to user if provided
    if body.parent_id:
        parent = await execute_one(
            "SELECT id FROM thread_labels WHERE id = :id AND user_id = :user_id",
            {"id": body.parent_id, "user_id": user_id},
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent label not found")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_labels (user_id, name, color, parent_id)
            VALUES (:user_id, :name, :color, :parent_id)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "color": body.color or "#6366f1",
                "parent_id": body.parent_id,
            },
            commit=True,
        )
        return serialize_row(dict(row))
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A label with this name already exists")
        raise


@router.get("/thread-labels", summary="List labels as tree")
async def list_labels(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT l.*, COALESCE(c.thread_count, 0) AS thread_count
        FROM thread_labels l
        LEFT JOIN (
            SELECT label_id, COUNT(*) AS thread_count
            FROM thread_label_assignments
            WHERE user_id = :user_id
            GROUP BY label_id
        ) c ON c.label_id = l.id
        WHERE l.user_id = :user_id
        ORDER BY l.sort_order, l.name
        """,
        {"user_id": user_id},
    )
    flat = serialize_rows([dict(r) for r in rows])
    return _build_label_tree(flat)


@router.patch("/thread-labels/{label_id}", summary="Update a label")
async def update_label(
    label_id: str,
    body: UpdateLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_labels WHERE id = :id AND user_id = :user_id",
        {"id": label_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Label not found")

    updates = {}
    params: dict = {"id": label_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name.strip()
        params["name"] = body.name.strip()
    if body.color is not None:
        updates["color"] = body.color
        params["color"] = body.color
    if body.parent_id is not None:
        # Prevent self-reference
        if body.parent_id == label_id:
            raise HTTPException(status_code=400, detail="Label cannot be its own parent")
        # Validate parent belongs to user (empty string means unset parent)
        if body.parent_id:
            parent = await execute_one(
                "SELECT id FROM thread_labels WHERE id = :pid AND user_id = :user_id",
                {"pid": body.parent_id, "user_id": user_id},
            )
            if not parent:
                raise HTTPException(status_code=404, detail="Parent label not found")
        updates["parent_id"] = body.parent_id if body.parent_id else None
        params["parent_id"] = body.parent_id if body.parent_id else None
    if body.sort_order is not None:
        updates["sort_order"] = body.sort_order
        params["sort_order"] = body.sort_order

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)

    try:
        row = await execute_one(
            f"UPDATE thread_labels SET {set_clause} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
            commit=True,
        )
        return serialize_row(dict(row))
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A label with this name already exists")
        raise


@router.delete("/thread-labels/{label_id}", summary="Delete a label (children become root)")
async def delete_label(
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_labels WHERE id = :id AND user_id = :user_id",
        {"id": label_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Label not found")

    # Children are handled by ON DELETE SET NULL on parent_id FK
    await execute_mutate(
        "DELETE FROM thread_labels WHERE id = :id AND user_id = :user_id",
        {"id": label_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Label assignment endpoints
# ---------------------------------------------------------------------------

@router.post("/threads/{thread_id}/labels", summary="Assign label to thread")
async def assign_label(
    thread_id: str,
    body: AssignLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify the label belongs to the user
    label = await execute_one(
        "SELECT id FROM thread_labels WHERE id = :label_id AND user_id = :user_id",
        {"label_id": body.label_id, "user_id": user_id},
    )
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_label_assignments (thread_id, label_id, user_id)
            VALUES (:thread_id, :label_id, :user_id)
            ON CONFLICT (thread_id, label_id) DO NOTHING
            RETURNING *
            """,
            {
                "thread_id": thread_id,
                "label_id": body.label_id,
                "user_id": user_id,
            },
            commit=True,
        )
        return {"status": "ok", "assignment": serialize_row(dict(row)) if row else None}
    except Exception:
        return {"status": "ok", "assignment": None}


@router.delete("/threads/{thread_id}/labels/{label_id}", summary="Remove label from thread")
async def remove_label(
    thread_id: str,
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute_mutate(
        """
        DELETE FROM thread_label_assignments
        WHERE thread_id = :thread_id AND label_id = :label_id AND user_id = :user_id
        """,
        {"thread_id": thread_id, "label_id": label_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.get("/threads/{thread_id}/labels", summary="List labels on a thread")
async def list_thread_labels(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT l.*
        FROM thread_labels l
        JOIN thread_label_assignments a ON a.label_id = l.id
        WHERE a.thread_id = :thread_id AND a.user_id = :user_id
        ORDER BY l.name
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/thread-labels/{label_id}/threads", summary="List threads with a specific label")
async def list_label_threads(
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify the label belongs to the user
    label = await execute_one(
        "SELECT id FROM thread_labels WHERE id = :label_id AND user_id = :user_id",
        {"label_id": label_id, "user_id": user_id},
    )
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    rows = await execute(
        """
        SELECT a.thread_id, a.assigned_at
        FROM thread_label_assignments a
        WHERE a.label_id = :label_id AND a.user_id = :user_id
        ORDER BY a.assigned_at DESC
        """,
        {"label_id": label_id, "user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])
