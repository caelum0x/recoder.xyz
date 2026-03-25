"""
Sprint 55 Phase 5: Saved Filters API

CRUD endpoints for saved filters with per-user, per-view-type scoping.
Supports setting a default filter per view type.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/filters", tags=["saved-filters"])

VALID_VIEW_TYPES = (
    "threads", "agents", "runs", "incidents",
    "activity", "billing", "bookmarks", "queue",
)


class CreateFilterRequest(BaseModel):
    name: str
    view_type: str
    filters: dict = {}
    is_default: Optional[bool] = False


class UpdateFilterRequest(BaseModel):
    name: Optional[str] = None
    filters: Optional[dict] = None
    is_default: Optional[bool] = None


@router.post("", summary="Save a filter")
async def create_filter(
    body: CreateFilterRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.view_type not in VALID_VIEW_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"view_type must be one of {VALID_VIEW_TYPES}",
        )

    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")

    # If this filter should be the default, unset existing defaults first
    if body.is_default:
        await execute_mutate(
            "UPDATE saved_filters SET is_default = false WHERE user_id::text = :user_id AND view_type = :view_type AND is_default = true",
            {"user_id": user_id, "view_type": body.view_type},
        )

    # Get next sort_order
    max_row = await execute_one(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM saved_filters WHERE user_id::text = :user_id AND view_type = :view_type",
        {"user_id": user_id, "view_type": body.view_type},
    )
    next_order = max_row["next_order"] if max_row else 0

    row = await execute_one(
        """
        INSERT INTO saved_filters (user_id, name, view_type, filters, is_default, sort_order)
        VALUES (:user_id, :name, :view_type, :filters::jsonb, :is_default, :sort_order)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name.strip(),
            "view_type": body.view_type,
            "filters": body.filters,
            "is_default": body.is_default or False,
            "sort_order": next_order,
        },
        commit=True,
    )
    return row


@router.get("", summary="List saved filters")
async def list_filters(
    view_type: Optional[str] = Query(None, description="Filter by view type"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if view_type:
        if view_type not in VALID_VIEW_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"view_type must be one of {VALID_VIEW_TYPES}",
            )
        rows = await execute(
            "SELECT * FROM saved_filters WHERE user_id::text = :user_id AND view_type = :view_type ORDER BY sort_order ASC, created_at ASC",
            {"user_id": user_id, "view_type": view_type},
        )
    else:
        rows = await execute(
            "SELECT * FROM saved_filters WHERE user_id::text = :user_id ORDER BY view_type ASC, sort_order ASC, created_at ASC",
            {"user_id": user_id},
        )
    return [dict(row) for row in rows]


@router.patch("/{filter_id}", summary="Update a saved filter")
async def update_filter(
    filter_id: str,
    body: UpdateFilterRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership
    existing = await execute_one(
        "SELECT * FROM saved_filters WHERE id = :id AND user_id::text = :user_id",
        {"id": filter_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Filter not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return dict(existing)

    # If setting as default, unset existing defaults for same view_type first
    if updates.get("is_default"):
        await execute_mutate(
            "UPDATE saved_filters SET is_default = false WHERE user_id::text = :user_id AND view_type = :view_type AND is_default = true AND id != :id",
            {"user_id": user_id, "view_type": existing["view_type"], "id": filter_id},
        )

    set_clauses = []
    params = {"id": filter_id, "user_id": user_id}
    for key, value in updates.items():
        if key == "filters":
            set_clauses.append(f"{key} = :{key}::jsonb")
        else:
            set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = await execute_one(
        f"UPDATE saved_filters SET {', '.join(set_clauses)} WHERE id = :id AND user_id::text = :user_id RETURNING *",
        params,
        commit=True,
    )
    return dict(row) if row else dict(existing)


@router.delete("/{filter_id}", summary="Delete a saved filter")
async def delete_filter(
    filter_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM saved_filters WHERE id = :id AND user_id::text = :user_id",
        {"id": filter_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Filter not found")

    await execute_mutate(
        "DELETE FROM saved_filters WHERE id = :id AND user_id::text = :user_id",
        {"id": filter_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.put("/{filter_id}/default", summary="Set filter as default for its view type")
async def set_default_filter(
    filter_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership and get view_type
    existing = await execute_one(
        "SELECT * FROM saved_filters WHERE id = :id AND user_id::text = :user_id",
        {"id": filter_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Filter not found")

    # Unset any existing default for this view_type
    await execute_mutate(
        "UPDATE saved_filters SET is_default = false WHERE user_id::text = :user_id AND view_type = :view_type AND is_default = true",
        {"user_id": user_id, "view_type": existing["view_type"]},
    )

    # Set this filter as default
    row = await execute_one(
        "UPDATE saved_filters SET is_default = true WHERE id = :id AND user_id::text = :user_id RETURNING *",
        {"id": filter_id, "user_id": user_id},
        commit=True,
    )
    return dict(row) if row else dict(existing)
