"""
Thread Folders API.

Allows users to create, manage, and organize threads into folders.
Supports nested folders, colored icons, and thread assignments.
"""

from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["thread-folders"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateFolderRequest(BaseModel):
    name: str
    color: Optional[str] = "#6b7280"
    icon: Optional[str] = "folder"
    parent_id: Optional[str] = None


class UpdateFolderRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[str] = None
    display_order: Optional[int] = None


class AssignThreadRequest(BaseModel):
    folder_id: str


# ============================================================================
# Folder CRUD Endpoints
# ============================================================================

@router.post("/thread-folders", summary="Create a thread folder")
async def create_folder(
    body: CreateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Folder name is required")

    # Validate parent_id belongs to user if provided
    if body.parent_id:
        parent = await execute_one(
            "SELECT id FROM thread_folders WHERE id = :id AND user_id = :user_id",
            {"id": body.parent_id, "user_id": user_id},
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_folders (user_id, name, color, icon, parent_id)
            VALUES (:user_id, :name, :color, :icon, :parent_id)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "color": body.color or "#6b7280",
                "icon": body.icon or "folder",
                "parent_id": body.parent_id,
            },
        )
        result = dict(row)
        result["id"] = str(result["id"])
        result["user_id"] = str(result["user_id"])
        result["parent_id"] = str(result["parent_id"]) if result.get("parent_id") else None
        result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
        return result
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A folder with this name already exists in this location")
        raise


@router.get("/thread-folders", summary="List user's thread folders with thread counts")
async def list_folders(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT f.*, COALESCE(c.thread_count, 0) AS thread_count
        FROM thread_folders f
        LEFT JOIN (
            SELECT folder_id, COUNT(*) AS thread_count
            FROM thread_folder_assignments
            WHERE user_id = :user_id
            GROUP BY folder_id
        ) c ON c.folder_id = f.id
        WHERE f.user_id = :user_id
        ORDER BY f.display_order ASC, f.name ASC
        """,
        {"user_id": user_id},
    )
    results = []
    for r in (rows or []):
        d = dict(r)
        d["id"] = str(d["id"])
        d["user_id"] = str(d["user_id"])
        d["parent_id"] = str(d["parent_id"]) if d.get("parent_id") else None
        d["created_at"] = d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"])
        results.append(d)
    return results


@router.patch("/thread-folders/{folder_id}", summary="Update a thread folder")
async def update_folder(
    folder_id: str,
    body: UpdateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_folders WHERE id = :id AND user_id = :user_id",
        {"id": folder_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Folder not found")

    updates = {}
    params = {"id": folder_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name.strip()
        params["name"] = body.name.strip()
    if body.color is not None:
        updates["color"] = body.color
        params["color"] = body.color
    if body.icon is not None:
        updates["icon"] = body.icon
        params["icon"] = body.icon
    if body.parent_id is not None:
        # Validate parent belongs to user and is not self
        if body.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="A folder cannot be its own parent")
        if body.parent_id:
            parent = await execute_one(
                "SELECT id FROM thread_folders WHERE id = :parent_id AND user_id = :user_id",
                {"parent_id": body.parent_id, "user_id": user_id},
            )
            if not parent:
                raise HTTPException(status_code=404, detail="Parent folder not found")
        updates["parent_id"] = body.parent_id if body.parent_id else None
        params["parent_id"] = body.parent_id if body.parent_id else None
    if body.display_order is not None:
        updates["display_order"] = body.display_order
        params["display_order"] = body.display_order

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    try:
        row = await execute_one(
            f"UPDATE thread_folders SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        result = dict(row)
        result["id"] = str(result["id"])
        result["user_id"] = str(result["user_id"])
        result["parent_id"] = str(result["parent_id"]) if result.get("parent_id") else None
        result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
        return result
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A folder with this name already exists in this location")
        raise


@router.delete("/thread-folders/{folder_id}", summary="Delete a thread folder (cascades assignments)")
async def delete_folder(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_folders WHERE id = :id AND user_id = :user_id",
        {"id": folder_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Folder not found")

    await execute(
        "DELETE FROM thread_folders WHERE id = :id AND user_id = :user_id",
        {"id": folder_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ============================================================================
# Thread Assignment Endpoints
# ============================================================================

@router.post("/threads/{thread_id}/folder", summary="Assign thread to a folder")
async def assign_thread_to_folder(
    thread_id: str,
    body: AssignThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify the folder belongs to the user
    folder = await execute_one(
        "SELECT id FROM thread_folders WHERE id = :folder_id AND user_id = :user_id",
        {"folder_id": body.folder_id, "user_id": user_id},
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_folder_assignments (thread_id, folder_id, user_id)
            VALUES (:thread_id, :folder_id, :user_id)
            ON CONFLICT (thread_id, folder_id) DO NOTHING
            RETURNING *
            """,
            {
                "thread_id": thread_id,
                "folder_id": body.folder_id,
                "user_id": user_id,
            },
        )
        return {"status": "ok", "assignment": dict(row) if row else None}
    except Exception:
        return {"status": "ok", "assignment": None}


@router.delete("/threads/{thread_id}/folder/{folder_id}", summary="Remove thread from folder")
async def remove_thread_from_folder(
    thread_id: str,
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        """
        DELETE FROM thread_folder_assignments
        WHERE thread_id = :thread_id AND folder_id = :folder_id AND user_id = :user_id
        """,
        {"thread_id": thread_id, "folder_id": folder_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.get("/thread-folders/{folder_id}/threads", summary="List threads in a folder")
async def list_folder_threads(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify folder belongs to user
    folder = await execute_one(
        "SELECT id FROM thread_folders WHERE id = :id AND user_id = :user_id",
        {"id": folder_id, "user_id": user_id},
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    rows = await execute(
        """
        SELECT a.thread_id, a.assigned_at
        FROM thread_folder_assignments a
        WHERE a.folder_id = :folder_id AND a.user_id = :user_id
        ORDER BY a.assigned_at DESC
        """,
        {"folder_id": folder_id, "user_id": user_id},
    )
    return [dict(r) for r in (rows or [])]
