"""
Sprint 43 Phase 2: User Preferences API

CRUD endpoints for user preferences with upsert semantics.
Returns sensible defaults when no row exists.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute_mutate, execute_one

router = APIRouter(tags=["user-preferences"])

# Default values mirroring the DB schema defaults
DEFAULTS = {
    "theme": "system",
    "language": "en",
    "font_size": "medium",
    "compact_mode": False,
    "reduced_animations": False,
    "sidebar_collapsed": False,
    "notification_email": True,
    "notification_push": True,
    "notification_in_app": True,
    "notification_agent_completed": True,
    "notification_agent_failed": True,
    "notification_thread_message": True,
    "notification_system_alert": True,
    "dashboard_widget_order": [],
    "timezone": "UTC",
}

PREFERENCE_COLUMNS = list(DEFAULTS.keys())


class PreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    font_size: Optional[str] = None
    compact_mode: Optional[bool] = None
    reduced_animations: Optional[bool] = None
    sidebar_collapsed: Optional[bool] = None
    notification_email: Optional[bool] = None
    notification_push: Optional[bool] = None
    notification_in_app: Optional[bool] = None
    notification_agent_completed: Optional[bool] = None
    notification_agent_failed: Optional[bool] = None
    notification_thread_message: Optional[bool] = None
    notification_system_alert: Optional[bool] = None
    dashboard_widget_order: Optional[List[str]] = None
    timezone: Optional[str] = None


@router.get("/preferences", summary="Get user preferences")
async def get_preferences(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get user preferences. Returns defaults if no row exists.
    """
    cols = ", ".join(PREFERENCE_COLUMNS) + ", updated_at"
    row = await execute_one(
        f"SELECT {cols} FROM user_preferences WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    if row:
        result = dict(row)
        result["user_id"] = user_id
        return result

    # No row — return defaults
    return {
        "user_id": user_id,
        **DEFAULTS,
        "updated_at": None,
    }


@router.put("/preferences", summary="Update user preferences")
async def update_preferences(
    body: PreferencesUpdate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Upsert user preferences. Only fields present in the body are updated.
    """
    updates = body.model_dump(exclude_none=True)
    if not updates:
        # Nothing to update, just return current
        return await get_preferences(user_id)

    # Build upsert query
    col_names = ["user_id"] + list(updates.keys()) + ["updated_at"]
    col_placeholders = [":user_id"] + [f":{k}" for k in updates.keys()] + ["now()"]
    conflict_sets = [f"{k} = :{k}" for k in updates.keys()] + ["updated_at = now()"]

    query = (
        f"INSERT INTO user_preferences ({', '.join(col_names)}) "
        f"VALUES ({', '.join(col_placeholders)}) "
        f"ON CONFLICT (user_id) DO UPDATE SET {', '.join(conflict_sets)} "
        f"RETURNING {', '.join(PREFERENCE_COLUMNS)}, updated_at"
    )

    params = {"user_id": user_id, **updates}
    row = await execute_one(query, params, commit=True)
    if row:
        result = dict(row)
        result["user_id"] = user_id
        return result

    return await get_preferences(user_id)


@router.post("/preferences/reset", summary="Reset preferences to defaults")
async def reset_preferences(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Reset user preferences to defaults by deleting their row.
    """
    await execute_mutate(
        "DELETE FROM user_preferences WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    return {
        "user_id": user_id,
        **DEFAULTS,
        "updated_at": None,
        "reset": True,
    }
