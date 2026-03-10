"""
Dashboard Widget Configuration API.

CRUD + batch-update for user-customizable dashboard widgets.
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/dashboard", tags=["dashboard-widgets"])


# ============================================================================
# Pydantic Models
# ============================================================================

VALID_WIDGET_TYPES = {
    "stats_card", "chart", "recent_threads", "active_runs",
    "agent_health", "cost_summary", "quick_actions", "bookmarks",
    "calendar", "notes",
}


class CreateWidgetRequest(BaseModel):
    widget_type: str = Field(..., description="One of: stats_card, chart, recent_threads, active_runs, agent_health, cost_summary, quick_actions, bookmarks, calendar, notes")
    title: str = Field(..., min_length=1, max_length=200)
    config: Optional[Dict[str, Any]] = None
    position_x: Optional[int] = 0
    position_y: Optional[int] = 0
    width: Optional[int] = 1
    height: Optional[int] = 1


class UpdateWidgetRequest(BaseModel):
    title: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    is_visible: Optional[bool] = None


class LayoutItem(BaseModel):
    id: str
    position_x: int
    position_y: int
    width: int
    height: int


class BatchLayoutRequest(BaseModel):
    widgets: List[LayoutItem]


# ============================================================================
# Default widget set
# ============================================================================

DEFAULT_WIDGETS = [
    {"widget_type": "stats_card",      "title": "Platform Stats",    "position_x": 0, "position_y": 0, "width": 2, "height": 1, "config": {}},
    {"widget_type": "active_runs",     "title": "Active Runs",       "position_x": 2, "position_y": 0, "width": 1, "height": 1, "config": {}},
    {"widget_type": "cost_summary",    "title": "Cost Summary",      "position_x": 3, "position_y": 0, "width": 1, "height": 1, "config": {}},
    {"widget_type": "recent_threads",  "title": "Recent Threads",    "position_x": 0, "position_y": 1, "width": 2, "height": 1, "config": {}},
    {"widget_type": "quick_actions",   "title": "Quick Actions",     "position_x": 2, "position_y": 1, "width": 1, "height": 1, "config": {}},
    {"widget_type": "chart",           "title": "Runs Over Time",    "position_x": 0, "position_y": 2, "width": 2, "height": 1, "config": {}},
    {"widget_type": "notes",           "title": "Notes",             "position_x": 3, "position_y": 1, "width": 1, "height": 1, "config": {}},
]


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/widgets", summary="List dashboard widget configs")
async def list_widgets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM dashboard_widget_configs
        WHERE user_id = :user_id
        ORDER BY position_y ASC, position_x ASC, created_at ASC
        """,
        {"user_id": user_id},
    )
    return serialize_rows([dict(r) for r in (rows or [])])


@router.post("/widgets", summary="Create a dashboard widget")
async def create_widget(
    body: CreateWidgetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.widget_type not in VALID_WIDGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid widget_type. Must be one of: {', '.join(sorted(VALID_WIDGET_TYPES))}")

    try:
        row = await execute_one(
            """
            INSERT INTO dashboard_widget_configs
                (user_id, widget_type, title, config, position_x, position_y, width, height)
            VALUES
                (:user_id, :widget_type, :title, :config, :position_x, :position_y, :width, :height)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "widget_type": body.widget_type,
                "title": body.title.strip(),
                "config": body.config or {},
                "position_x": body.position_x or 0,
                "position_y": body.position_y or 0,
                "width": body.width or 1,
                "height": body.height or 1,
            },
        )
        return serialize_row(dict(row))
    except Exception as e:
        logger.error(f"Failed to create widget: {e}")
        raise HTTPException(status_code=500, detail="Failed to create widget")


@router.patch("/widgets/{widget_id}", summary="Update a dashboard widget")
async def update_widget(
    widget_id: str,
    body: UpdateWidgetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM dashboard_widget_configs WHERE id = :id AND user_id = :user_id",
        {"id": widget_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Widget not found")

    updates: Dict[str, Any] = {}
    params: Dict[str, Any] = {"id": widget_id, "user_id": user_id}

    if body.title is not None:
        updates["title"] = body.title.strip()
        params["title"] = body.title.strip()
    if body.config is not None:
        updates["config"] = body.config
        params["config"] = body.config
    if body.position_x is not None:
        updates["position_x"] = body.position_x
        params["position_x"] = body.position_x
    if body.position_y is not None:
        updates["position_y"] = body.position_y
        params["position_y"] = body.position_y
    if body.width is not None:
        updates["width"] = body.width
        params["width"] = body.width
    if body.height is not None:
        updates["height"] = body.height
        params["height"] = body.height
    if body.is_visible is not None:
        updates["is_visible"] = body.is_visible
        params["is_visible"] = body.is_visible

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    set_clauses += ", updated_at = now()"

    row = await execute_one(
        f"UPDATE dashboard_widget_configs SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    return serialize_row(dict(row))


@router.delete("/widgets/{widget_id}", summary="Delete a dashboard widget")
async def delete_widget(
    widget_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM dashboard_widget_configs WHERE id = :id AND user_id = :user_id",
        {"id": widget_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Widget not found")

    await execute(
        "DELETE FROM dashboard_widget_configs WHERE id = :id AND user_id = :user_id",
        {"id": widget_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/widgets/reset", summary="Reset to default widget layout")
async def reset_widgets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    try:
        # Delete all existing widgets for this user
        await execute(
            "DELETE FROM dashboard_widget_configs WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        # Insert default widgets
        created = []
        for w in DEFAULT_WIDGETS:
            row = await execute_one(
                """
                INSERT INTO dashboard_widget_configs
                    (user_id, widget_type, title, config, position_x, position_y, width, height)
                VALUES
                    (:user_id, :widget_type, :title, :config, :position_x, :position_y, :width, :height)
                RETURNING *
                """,
                {"user_id": user_id, **w},
            )
            created.append(serialize_row(dict(row)))

        return {"status": "ok", "widgets": created}
    except Exception as e:
        logger.error(f"Failed to reset widgets: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset widgets")


@router.put("/widgets/layout", summary="Batch update widget positions and sizes")
async def batch_update_layout(
    body: BatchLayoutRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    try:
        updated = []
        for item in body.widgets:
            row = await execute_one(
                """
                UPDATE dashboard_widget_configs
                SET position_x = :position_x,
                    position_y = :position_y,
                    width = :width,
                    height = :height,
                    updated_at = now()
                WHERE id = :id AND user_id = :user_id
                RETURNING *
                """,
                {
                    "id": item.id,
                    "user_id": user_id,
                    "position_x": item.position_x,
                    "position_y": item.position_y,
                    "width": item.width,
                    "height": item.height,
                },
            )
            if row:
                updated.append(serialize_row(dict(row)))

        return {"status": "ok", "widgets": updated}
    except Exception as e:
        logger.error(f"Failed to batch update layout: {e}")
        raise HTTPException(status_code=500, detail="Failed to batch update layout")
