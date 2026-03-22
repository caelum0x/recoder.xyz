"""
Thread Labels API endpoints.

Provides CRUD for label definitions and assignment of labels to threads,
plus bulk assignment and reverse lookup.
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-labels"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateLabelRequest(BaseModel):
    label_name: str
    color: Optional[str] = "#6366f1"
    description: Optional[str] = None
    icon: Optional[str] = "tag"


class UpdateLabelRequest(BaseModel):
    label_name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None


class AssignLabelRequest(BaseModel):
    label_id: str


class BulkAssignRequest(BaseModel):
    label_id: str
    thread_ids: List[str]


# ============================================================================
# Endpoints — Label Definitions
# ============================================================================

@router.post(
    "/labels",
    summary="Create thread label",
    operation_id="create_thread_label",
)
async def create_label(
    body: CreateLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new thread label definition."""
    try:
        row = await execute_one(
            """
            INSERT INTO thread_label_definitions
              (user_id, label_name, color, description, icon)
            VALUES
              (:user_id, :label_name, :color, :description, :icon)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "label_name": body.label_name,
                "color": body.color or "#6366f1",
                "description": body.description,
                "icon": body.icon or "tag",
            },
        )
        return serialize_row(row)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A label with that name already exists.")
        logger.error(f"create_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create label.")


@router.get(
    "/labels",
    summary="List thread labels",
    operation_id="list_thread_labels",
)
async def list_labels(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all label definitions with usage count."""
    try:
        rows = await execute(
            """
            SELECT ld.*,
                   COUNT(la.id) AS thread_count
            FROM thread_label_definitions ld
            LEFT JOIN thread_label_assignments la ON la.label_id = ld.id
            WHERE ld.user_id = :user_id
            GROUP BY ld.id
            ORDER BY ld.created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_labels error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list labels.")


@router.patch(
    "/labels/{label_id}",
    summary="Update thread label",
    operation_id="update_thread_label",
)
async def update_label(
    label_id: str,
    body: UpdateLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a label definition."""
    try:
        existing = await execute_one(
            "SELECT * FROM thread_label_definitions WHERE id = :label_id AND user_id = :user_id",
            {"label_id": label_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Label not found.")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            return serialize_row(existing)

        set_clauses: List[str] = []
        params: Dict[str, Any] = {"label_id": label_id, "user_id": user_id}
        for key, val in updates.items():
            set_clauses.append(f"{key} = :{key}")
            params[key] = val

        sql = (
            f"UPDATE thread_label_definitions SET {', '.join(set_clauses)} "
            f"WHERE id = :label_id AND user_id = :user_id RETURNING *"
        )
        row = await execute_one(sql, params)
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update label.")


@router.delete(
    "/labels/{label_id}",
    summary="Delete thread label",
    operation_id="delete_thread_label",
)
async def delete_label(
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a label definition (cascades to assignments)."""
    try:
        await execute_mutate(
            "DELETE FROM thread_label_definitions WHERE id = :label_id AND user_id = :user_id",
            {"label_id": label_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete label.")


# ============================================================================
# Endpoints — Assignments
# ============================================================================

@router.post(
    "/threads/{thread_id}/labels",
    summary="Assign label to thread",
    operation_id="assign_label_to_thread",
)
async def assign_label(
    thread_id: str,
    body: AssignLabelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign a label to a thread (idempotent)."""
    try:
        # Verify label belongs to user
        label = await execute_one(
            "SELECT id FROM thread_label_definitions WHERE id = :label_id AND user_id = :user_id",
            {"label_id": body.label_id, "user_id": user_id},
        )
        if not label:
            raise HTTPException(status_code=404, detail="Label not found.")

        row = await execute_one(
            """
            INSERT INTO thread_label_assignments (user_id, thread_id, label_id)
            VALUES (:user_id, :thread_id, :label_id)
            ON CONFLICT DO NOTHING
            RETURNING *
            """,
            {"user_id": user_id, "thread_id": thread_id, "label_id": body.label_id},
        )
        if row:
            return serialize_row(row)
        # Already assigned — return existing
        existing = await execute_one(
            """
            SELECT * FROM thread_label_assignments
            WHERE user_id = :user_id AND thread_id = :thread_id AND label_id = :label_id
            """,
            {"user_id": user_id, "thread_id": thread_id, "label_id": body.label_id},
        )
        return serialize_row(existing)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign label.")


@router.delete(
    "/threads/{thread_id}/labels/{label_id}",
    summary="Remove label from thread",
    operation_id="remove_label_from_thread",
)
async def remove_label(
    thread_id: str,
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a label assignment from a thread."""
    try:
        await execute_mutate(
            """
            DELETE FROM thread_label_assignments
            WHERE user_id = :user_id AND thread_id = :thread_id AND label_id = :label_id
            """,
            {"user_id": user_id, "thread_id": thread_id, "label_id": label_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"remove_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove label.")


@router.get(
    "/threads/{thread_id}/labels",
    summary="Get labels for thread",
    operation_id="get_thread_label_assignments",
)
async def get_thread_labels(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get all labels assigned to a thread, with definition details."""
    try:
        rows = await execute(
            """
            SELECT la.*,
                   ld.label_name, ld.color, ld.description, ld.icon
            FROM thread_label_assignments la
            JOIN thread_label_definitions ld ON ld.id = la.label_id
            WHERE la.thread_id = :thread_id AND la.user_id = :user_id
            ORDER BY la.assigned_at DESC
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"get_thread_labels error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get thread labels.")


@router.get(
    "/labels/{label_id}/threads",
    summary="Get threads for label",
    operation_id="get_label_threads",
)
async def get_label_threads(
    label_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get all thread_ids assigned to a label."""
    try:
        owner = await execute_one(
            "SELECT id FROM thread_label_definitions WHERE id = :label_id AND user_id = :user_id",
            {"label_id": label_id, "user_id": user_id},
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Label not found.")

        rows = await execute(
            """
            SELECT thread_id, assigned_at
            FROM thread_label_assignments
            WHERE label_id = :label_id AND user_id = :user_id
            ORDER BY assigned_at DESC
            """,
            {"label_id": label_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_label_threads error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get label threads.")


@router.post(
    "/labels/bulk-assign",
    summary="Bulk assign label to threads",
    operation_id="bulk_assign_label",
)
async def bulk_assign_label(
    body: BulkAssignRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign a label to multiple threads, ignoring duplicates."""
    try:
        label = await execute_one(
            "SELECT id FROM thread_label_definitions WHERE id = :label_id AND user_id = :user_id",
            {"label_id": body.label_id, "user_id": user_id},
        )
        if not label:
            raise HTTPException(status_code=404, detail="Label not found.")

        assigned_count = 0
        for thread_id in body.thread_ids:
            row = await execute_one(
                """
                INSERT INTO thread_label_assignments (user_id, thread_id, label_id)
                VALUES (:user_id, :thread_id, :label_id)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                {"user_id": user_id, "thread_id": thread_id, "label_id": body.label_id},
            )
            if row:
                assigned_count += 1

        return {"assigned_count": assigned_count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bulk_assign_label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to bulk assign label.")
