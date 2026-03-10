from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel, Field
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
from datetime import datetime, timezone

router = APIRouter(prefix="/onboarding", tags=["onboarding-checklists"])


# ---------- Request / Response Models ----------

class ChecklistItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    action_url: Optional[str] = None
    sort_order: Optional[int] = 0


class ChecklistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    checklist_type: Optional[str] = "workspace"
    is_template: Optional[bool] = False
    items: Optional[List[ChecklistItemCreate]] = None


class ChecklistItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    action_url: Optional[str] = None
    is_completed: Optional[bool] = None


class ChecklistItemResponse(BaseModel):
    id: str
    checklist_id: str
    user_id: str
    title: str
    description: Optional[str] = None
    action_url: Optional[str] = None
    sort_order: int
    is_completed: bool
    completed_at: Optional[str] = None
    created_at: Optional[str] = None


class ChecklistResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    checklist_type: str
    is_template: bool
    created_at: Optional[str] = None
    items: Optional[List[ChecklistItemResponse]] = None
    completed_count: Optional[int] = None
    total_count: Optional[int] = None


# ---------- Helpers ----------

def _row_to_checklist(row: dict) -> dict:
    """Normalize a DB row to a checklist dict with string timestamps."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "name": row["name"],
        "description": row.get("description"),
        "checklist_type": row.get("checklist_type", "workspace"),
        "is_template": row.get("is_template", False),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _row_to_item(row: dict) -> dict:
    """Normalize a DB row to a checklist item dict with string timestamps."""
    return {
        "id": str(row["id"]),
        "checklist_id": str(row["checklist_id"]),
        "user_id": str(row["user_id"]),
        "title": row["title"],
        "description": row.get("description"),
        "action_url": row.get("action_url"),
        "sort_order": row.get("sort_order", 0),
        "is_completed": row.get("is_completed", False),
        "completed_at": row["completed_at"].isoformat() if row.get("completed_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ---------- Checklist CRUD ----------

@router.post("/checklists", summary="Create Checklist", operation_id="create_checklist")
async def create_checklist(
    body: ChecklistCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a checklist with optional initial items."""
    if body.checklist_type and body.checklist_type not in ("workspace", "agent", "team", "custom"):
        raise HTTPException(status_code=400, detail="Invalid checklist_type")

    try:
        checklist_row = await execute_one(
            """
            INSERT INTO onboarding_checklists (user_id, name, description, checklist_type, is_template)
            VALUES (:user_id, :name, :description, :checklist_type, :is_template)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name,
                "description": body.description,
                "checklist_type": body.checklist_type or "workspace",
                "is_template": body.is_template or False,
            },
        )

        checklist = _row_to_checklist(checklist_row)
        checklist_id = checklist["id"]

        items = []
        if body.items:
            for idx, item in enumerate(body.items):
                item_row = await execute_one(
                    """
                    INSERT INTO onboarding_checklist_items (checklist_id, user_id, title, description, action_url, sort_order)
                    VALUES (:checklist_id, :user_id, :title, :description, :action_url, :sort_order)
                    RETURNING *
                    """,
                    {
                        "checklist_id": checklist_id,
                        "user_id": user_id,
                        "title": item.title,
                        "description": item.description,
                        "action_url": item.action_url,
                        "sort_order": item.sort_order if item.sort_order is not None else idx,
                    },
                )
                items.append(_row_to_item(item_row))

        checklist["items"] = items
        checklist["completed_count"] = 0
        checklist["total_count"] = len(items)
        return checklist

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create checklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checklist")


@router.get("/checklists", summary="List Checklists", operation_id="list_checklists")
async def list_checklists(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    checklist_type: Optional[str] = Query(None),
):
    """List checklists with progress (completed/total)."""
    try:
        params: dict = {"user_id": user_id}
        type_filter = ""
        if checklist_type:
            type_filter = "AND c.checklist_type = :checklist_type"
            params["checklist_type"] = checklist_type

        rows = await execute(
            f"""
            SELECT c.*,
                   COALESCE(s.total, 0) AS total_count,
                   COALESCE(s.completed, 0) AS completed_count
            FROM onboarding_checklists c
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_completed)::int AS completed
                FROM onboarding_checklist_items
                WHERE checklist_id = c.id
            ) s ON true
            WHERE c.user_id = :user_id {type_filter}
            ORDER BY c.created_at DESC
            """,
            params,
        )

        checklists = []
        for row in rows:
            cl = _row_to_checklist(row)
            cl["completed_count"] = row.get("completed_count", 0)
            cl["total_count"] = row.get("total_count", 0)
            checklists.append(cl)

        return {"checklists": checklists}

    except Exception as e:
        logger.error(f"Failed to list checklists: {e}")
        raise HTTPException(status_code=500, detail="Failed to list checklists")


@router.get("/checklists/{checklist_id}", summary="Get Checklist Detail", operation_id="get_checklist")
async def get_checklist(
    checklist_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get checklist detail with all items ordered by sort_order."""
    try:
        checklist_row = await execute_one(
            "SELECT * FROM onboarding_checklists WHERE id = :checklist_id AND user_id = :user_id",
            {"checklist_id": checklist_id, "user_id": user_id},
        )
        if not checklist_row:
            raise HTTPException(status_code=404, detail="Checklist not found")

        checklist = _row_to_checklist(checklist_row)

        item_rows = await execute(
            "SELECT * FROM onboarding_checklist_items WHERE checklist_id = :checklist_id AND user_id = :user_id ORDER BY sort_order ASC, created_at ASC",
            {"checklist_id": checklist_id, "user_id": user_id},
        )

        items = [_row_to_item(r) for r in item_rows]
        checklist["items"] = items
        checklist["completed_count"] = sum(1 for i in items if i["is_completed"])
        checklist["total_count"] = len(items)
        return checklist

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get checklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to get checklist")


@router.delete("/checklists/{checklist_id}", summary="Delete Checklist", operation_id="delete_checklist")
async def delete_checklist(
    checklist_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a checklist (cascades items)."""
    try:
        result = await execute_mutate(
            "DELETE FROM onboarding_checklists WHERE id = :checklist_id AND user_id = :user_id",
            {"checklist_id": checklist_id, "user_id": user_id},
        )
        if result == 0:
            raise HTTPException(status_code=404, detail="Checklist not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete checklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete checklist")


# ---------- Checklist Item CRUD ----------

@router.post("/checklists/{checklist_id}/items", summary="Add Checklist Item", operation_id="add_checklist_item")
async def add_checklist_item(
    checklist_id: str,
    body: ChecklistItemCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add an item to a checklist."""
    try:
        # Verify checklist ownership
        cl = await execute_one(
            "SELECT id FROM onboarding_checklists WHERE id = :checklist_id AND user_id = :user_id",
            {"checklist_id": checklist_id, "user_id": user_id},
        )
        if not cl:
            raise HTTPException(status_code=404, detail="Checklist not found")

        item_row = await execute_one(
            """
            INSERT INTO onboarding_checklist_items (checklist_id, user_id, title, description, action_url, sort_order)
            VALUES (:checklist_id, :user_id, :title, :description, :action_url, :sort_order)
            RETURNING *
            """,
            {
                "checklist_id": checklist_id,
                "user_id": user_id,
                "title": body.title,
                "description": body.description,
                "action_url": body.action_url,
                "sort_order": body.sort_order if body.sort_order is not None else 0,
            },
        )

        return _row_to_item(item_row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add checklist item: {e}")
        raise HTTPException(status_code=500, detail="Failed to add checklist item")


@router.patch(
    "/checklists/{checklist_id}/items/{item_id}",
    summary="Update Checklist Item",
    operation_id="update_checklist_item",
)
async def update_checklist_item(
    checklist_id: str,
    item_id: str,
    body: ChecklistItemUpdate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a checklist item. Sets completed_at when marking complete."""
    try:
        # Build dynamic SET clause
        sets: list[str] = []
        params: dict = {
            "item_id": item_id,
            "checklist_id": checklist_id,
            "user_id": user_id,
        }

        if body.title is not None:
            sets.append("title = :title")
            params["title"] = body.title
        if body.description is not None:
            sets.append("description = :description")
            params["description"] = body.description
        if body.action_url is not None:
            sets.append("action_url = :action_url")
            params["action_url"] = body.action_url
        if body.is_completed is not None:
            sets.append("is_completed = :is_completed")
            params["is_completed"] = body.is_completed
            if body.is_completed:
                sets.append("completed_at = :completed_at")
                params["completed_at"] = datetime.now(timezone.utc)
            else:
                sets.append("completed_at = NULL")

        if not sets:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(sets)
        row = await execute_one(
            f"""
            UPDATE onboarding_checklist_items
            SET {set_clause}
            WHERE id = :item_id AND checklist_id = :checklist_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")

        return _row_to_item(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update checklist item: {e}")
        raise HTTPException(status_code=500, detail="Failed to update checklist item")


@router.delete(
    "/checklists/{checklist_id}/items/{item_id}",
    summary="Delete Checklist Item",
    operation_id="delete_checklist_item",
)
async def delete_checklist_item(
    checklist_id: str,
    item_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove an item from a checklist."""
    try:
        result = await execute_mutate(
            "DELETE FROM onboarding_checklist_items WHERE id = :item_id AND checklist_id = :checklist_id AND user_id = :user_id",
            {"item_id": item_id, "checklist_id": checklist_id, "user_id": user_id},
        )
        if result == 0:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete checklist item: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete checklist item")


# ---------- Seed Default Checklist ----------

DEFAULT_WORKSPACE_ITEMS = [
    {"title": "Create your first agent", "description": "Set up an AI agent to help with your tasks", "action_url": "/agents", "sort_order": 0},
    {"title": "Start a conversation thread", "description": "Open a thread and chat with your agent", "action_url": "/", "sort_order": 1},
    {"title": "Configure agent tools", "description": "Add tools to extend your agent's capabilities", "action_url": "/agents", "sort_order": 2},
    {"title": "Add knowledge base entries", "description": "Upload documents to give your agent context", "action_url": "/knowledge", "sort_order": 3},
    {"title": "Invite team members", "description": "Collaborate with your team on shared agents", "action_url": "/settings/team", "sort_order": 4},
]


@router.post("/checklists/seed", summary="Seed Default Checklist", operation_id="seed_default_checklist")
async def seed_default_checklist(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Seed a default workspace onboarding checklist with 5 items."""
    try:
        checklist_row = await execute_one(
            """
            INSERT INTO onboarding_checklists (user_id, name, description, checklist_type, is_template)
            VALUES (:user_id, :name, :description, :checklist_type, :is_template)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": "Getting Started",
                "description": "Complete these steps to set up your workspace",
                "checklist_type": "workspace",
                "is_template": False,
            },
        )

        checklist = _row_to_checklist(checklist_row)
        checklist_id = checklist["id"]

        items = []
        for item_data in DEFAULT_WORKSPACE_ITEMS:
            item_row = await execute_one(
                """
                INSERT INTO onboarding_checklist_items (checklist_id, user_id, title, description, action_url, sort_order)
                VALUES (:checklist_id, :user_id, :title, :description, :action_url, :sort_order)
                RETURNING *
                """,
                {
                    "checklist_id": checklist_id,
                    "user_id": user_id,
                    "title": item_data["title"],
                    "description": item_data["description"],
                    "action_url": item_data["action_url"],
                    "sort_order": item_data["sort_order"],
                },
            )
            items.append(_row_to_item(item_row))

        checklist["items"] = items
        checklist["completed_count"] = 0
        checklist["total_count"] = len(items)
        return checklist

    except Exception as e:
        logger.error(f"Failed to seed default checklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to seed default checklist")
