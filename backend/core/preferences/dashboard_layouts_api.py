"""
Sprint 60 Phase 5: Dashboard Layouts API

CRUD endpoints for custom dashboard layouts with per-user scoping.
Supports layout templates and batch widget management.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger

router = APIRouter(prefix="/dashboard/layouts", tags=["dashboard-layouts"])

VALID_WIDGET_TYPES = (
    "agent_status", "recent_threads", "activity_feed", "health_status",
    "quick_actions", "favorites", "stats_card", "chart", "checklist", "bookmarks",
)


class WidgetInput(BaseModel):
    widget_type: str
    position_x: int = 0
    position_y: int = 0
    width: int = 1
    height: int = 1
    config: Optional[dict] = None


class CreateLayoutRequest(BaseModel):
    name: str
    widgets: Optional[List[WidgetInput]] = None


class UpdateLayoutRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class SetWidgetsRequest(BaseModel):
    widgets: List[WidgetInput]


@router.post("", summary="Create a dashboard layout")
async def create_layout(
    body: CreateLayoutRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")

    # Insert the layout
    layout = await execute_one(
        """
        INSERT INTO dashboard_layouts (user_id, name)
        VALUES (:user_id, :name)
        RETURNING *
        """,
        {"user_id": user_id, "name": body.name.strip()},
        commit=True,
    )
    if not layout:
        raise HTTPException(status_code=500, detail="Failed to create layout")

    layout_id = str(layout["id"])
    widgets = []

    # Insert widgets if provided
    if body.widgets:
        for w in body.widgets:
            if w.widget_type not in VALID_WIDGET_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"widget_type must be one of {VALID_WIDGET_TYPES}",
                )
            widget = await execute_one(
                """
                INSERT INTO dashboard_layout_widgets (layout_id, widget_type, position_x, position_y, width, height, config)
                VALUES (:layout_id, :widget_type, :position_x, :position_y, :width, :height, :config::jsonb)
                RETURNING *
                """,
                {
                    "layout_id": layout_id,
                    "widget_type": w.widget_type,
                    "position_x": w.position_x,
                    "position_y": w.position_y,
                    "width": w.width,
                    "height": w.height,
                    "config": w.config or {},
                },
                commit=True,
            )
            if widget:
                widgets.append(serialize_row(widget))

    result = serialize_row(layout)
    result["widgets"] = widgets
    return result


@router.get("", summary="List dashboard layouts")
async def list_layouts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT l.*, COUNT(w.id) AS widget_count
        FROM dashboard_layouts l
        LEFT JOIN dashboard_layout_widgets w ON w.layout_id::text = l.id::text
        WHERE l.user_id::text = :user_id AND l.is_template = false
        GROUP BY l.id
        ORDER BY l.created_at DESC
        """,
        {"user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/templates", summary="List layout templates")
async def list_templates(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT l.*, COUNT(w.id) AS widget_count
        FROM dashboard_layouts l
        LEFT JOIN dashboard_layout_widgets w ON w.layout_id::text = l.id::text
        WHERE l.is_template = true
        GROUP BY l.id
        ORDER BY l.name ASC
        """,
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/{layout_id}", summary="Get a dashboard layout with widgets")
async def get_layout(
    layout_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    layout = await execute_one(
        "SELECT * FROM dashboard_layouts WHERE id = :id AND (user_id::text = :user_id OR is_template = true)",
        {"id": layout_id, "user_id": user_id},
    )
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")

    widgets = await execute(
        "SELECT * FROM dashboard_layout_widgets WHERE layout_id::text = :layout_id ORDER BY position_y ASC, position_x ASC",
        {"layout_id": layout_id},
    )

    result = serialize_row(dict(layout))
    result["widgets"] = serialize_rows([dict(w) for w in widgets])
    return result


@router.patch("/{layout_id}", summary="Update a dashboard layout")
async def update_layout(
    layout_id: str,
    body: UpdateLayoutRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership
    existing = await execute_one(
        "SELECT * FROM dashboard_layouts WHERE id = :id AND user_id::text = :user_id",
        {"id": layout_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Layout not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return serialize_row(dict(existing))

    # If setting as active, deactivate all other layouts for this user
    if updates.get("is_active"):
        await execute_mutate(
            "UPDATE dashboard_layouts SET is_active = false WHERE user_id::text = :user_id AND is_active = true AND id != :id",
            {"user_id": user_id, "id": layout_id},
        )

    set_clauses = ["updated_at = now()"]
    params = {"id": layout_id, "user_id": user_id}
    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = await execute_one(
        f"UPDATE dashboard_layouts SET {', '.join(set_clauses)} WHERE id = :id AND user_id::text = :user_id RETURNING *",
        params,
        commit=True,
    )
    return serialize_row(dict(row)) if row else serialize_row(dict(existing))


@router.delete("/{layout_id}", summary="Delete a dashboard layout")
async def delete_layout(
    layout_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM dashboard_layouts WHERE id = :id AND user_id::text = :user_id",
        {"id": layout_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Layout not found")

    # Widgets are cascade-deleted by the FK constraint
    await execute_mutate(
        "DELETE FROM dashboard_layouts WHERE id = :id AND user_id::text = :user_id",
        {"id": layout_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.put("/{layout_id}/widgets", summary="Batch set widgets for a layout")
async def set_layout_widgets(
    layout_id: str,
    body: SetWidgetsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM dashboard_layouts WHERE id = :id AND user_id::text = :user_id",
        {"id": layout_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Layout not found")

    # Validate all widget types
    for w in body.widgets:
        if w.widget_type not in VALID_WIDGET_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"widget_type must be one of {VALID_WIDGET_TYPES}",
            )

    # Delete old widgets
    await execute_mutate(
        "DELETE FROM dashboard_layout_widgets WHERE layout_id::text = :layout_id",
        {"layout_id": layout_id},
    )

    # Insert new widgets
    widgets = []
    for w in body.widgets:
        widget = await execute_one(
            """
            INSERT INTO dashboard_layout_widgets (layout_id, widget_type, position_x, position_y, width, height, config)
            VALUES (:layout_id, :widget_type, :position_x, :position_y, :width, :height, :config::jsonb)
            RETURNING *
            """,
            {
                "layout_id": layout_id,
                "widget_type": w.widget_type,
                "position_x": w.position_x,
                "position_y": w.position_y,
                "width": w.width,
                "height": w.height,
                "config": w.config or {},
            },
            commit=True,
        )
        if widget:
            widgets.append(serialize_row(widget))

    # Update layout timestamp
    await execute_mutate(
        "UPDATE dashboard_layouts SET updated_at = now() WHERE id = :id",
        {"id": layout_id},
    )

    return {"status": "ok", "widgets": widgets}
