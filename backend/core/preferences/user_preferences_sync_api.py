"""
Sprint 62 Phase 5: User Preferences Sync API

CRUD + sync endpoints for user preferences with category-based grouping,
cross-device push/pull sync, and sync log history.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/preferences", tags=["user-preferences-sync"])

VALID_CATEGORIES = (
    "general", "appearance", "editor",
    "notifications", "shortcuts", "layout", "privacy",
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SetPreferenceRequest(BaseModel):
    preference_key: str
    preference_value: dict | str | int | float | bool | list = {}
    category: Optional[str] = "general"


class BatchSetPreferencesRequest(BaseModel):
    preferences: List[SetPreferenceRequest]


class SyncPushRequest(BaseModel):
    device_id: str
    preferences: List[SetPreferenceRequest]


# ---------------------------------------------------------------------------
# GET /preferences — list all preferences (optionally filtered by category)
# ---------------------------------------------------------------------------

@router.get("", summary="Get all user preferences")
async def get_preferences(
    category: Optional[str] = Query(None, description="Filter by category"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if category:
        if category not in VALID_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"category must be one of {VALID_CATEGORIES}",
            )
        rows = await execute(
            "SELECT * FROM user_preferences WHERE user_id::text = :user_id AND category = :category ORDER BY preference_key ASC",
            {"user_id": user_id, "category": category},
        )
    else:
        rows = await execute(
            "SELECT * FROM user_preferences WHERE user_id::text = :user_id ORDER BY category ASC, preference_key ASC",
            {"user_id": user_id},
        )
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# PUT /preferences — set a single preference (upsert)
# ---------------------------------------------------------------------------

@router.put("", summary="Set a single preference")
async def set_preference(
    body: SetPreferenceRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.preference_key or not body.preference_key.strip():
        raise HTTPException(status_code=400, detail="preference_key is required")

    cat = body.category or "general"
    if cat not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of {VALID_CATEGORIES}",
        )

    row = await execute_one(
        """
        INSERT INTO user_preferences (user_id, preference_key, preference_value, category, updated_at)
        VALUES (:user_id, :preference_key, :preference_value::jsonb, :category, now())
        ON CONFLICT (user_id, preference_key)
        DO UPDATE SET
            preference_value = EXCLUDED.preference_value,
            category = EXCLUDED.category,
            updated_at = now()
        RETURNING *
        """,
        {
            "user_id": user_id,
            "preference_key": body.preference_key.strip(),
            "preference_value": body.preference_value,
            "category": cat,
        },
        commit=True,
    )
    return dict(row) if row else {"status": "ok"}


# ---------------------------------------------------------------------------
# PUT /preferences/batch — batch set preferences
# ---------------------------------------------------------------------------

@router.put("/batch", summary="Batch set preferences")
async def batch_set_preferences(
    body: BatchSetPreferencesRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.preferences:
        raise HTTPException(status_code=400, detail="preferences list is required")

    results = []
    for pref in body.preferences:
        if not pref.preference_key or not pref.preference_key.strip():
            continue

        cat = pref.category or "general"
        if cat not in VALID_CATEGORIES:
            cat = "general"

        row = await execute_one(
            """
            INSERT INTO user_preferences (user_id, preference_key, preference_value, category, updated_at)
            VALUES (:user_id, :preference_key, :preference_value::jsonb, :category, now())
            ON CONFLICT (user_id, preference_key)
            DO UPDATE SET
                preference_value = EXCLUDED.preference_value,
                category = EXCLUDED.category,
                updated_at = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "preference_key": pref.preference_key.strip(),
                "preference_value": pref.preference_value,
                "category": cat,
            },
            commit=True,
        )
        if row:
            results.append(dict(row))

    return {"status": "ok", "updated": len(results), "preferences": results}


# ---------------------------------------------------------------------------
# DELETE /preferences/{preference_key} — delete a single preference
# ---------------------------------------------------------------------------

@router.delete("/{preference_key}", summary="Delete a preference")
async def delete_preference(
    preference_key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM user_preferences WHERE user_id::text = :user_id AND preference_key = :preference_key",
        {"user_id": user_id, "preference_key": preference_key},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Preference not found")

    await execute_mutate(
        "DELETE FROM user_preferences WHERE user_id::text = :user_id AND preference_key = :preference_key",
        {"user_id": user_id, "preference_key": preference_key},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /preferences/sync — sync push (upsert all + record sync log)
# ---------------------------------------------------------------------------

@router.post("/sync", summary="Sync push preferences")
async def sync_push(
    body: SyncPushRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.device_id or not body.device_id.strip():
        raise HTTPException(status_code=400, detail="device_id is required")

    if not body.preferences:
        raise HTTPException(status_code=400, detail="preferences list is required")

    synced_count = 0
    for pref in body.preferences:
        if not pref.preference_key or not pref.preference_key.strip():
            continue

        cat = pref.category or "general"
        if cat not in VALID_CATEGORIES:
            cat = "general"

        await execute_mutate(
            """
            INSERT INTO user_preferences (user_id, preference_key, preference_value, category, updated_at)
            VALUES (:user_id, :preference_key, :preference_value::jsonb, :category, now())
            ON CONFLICT (user_id, preference_key)
            DO UPDATE SET
                preference_value = EXCLUDED.preference_value,
                category = EXCLUDED.category,
                updated_at = now()
            """,
            {
                "user_id": user_id,
                "preference_key": pref.preference_key.strip(),
                "preference_value": pref.preference_value,
                "category": cat,
            },
        )
        synced_count += 1

    # Record sync log
    await execute_mutate(
        """
        INSERT INTO preference_sync_log (user_id, device_id, sync_type, preferences_synced)
        VALUES (:user_id, :device_id, 'push', :preferences_synced)
        """,
        {
            "user_id": user_id,
            "device_id": body.device_id.strip(),
            "preferences_synced": synced_count,
        },
    )

    return {"status": "ok", "synced": synced_count}


# ---------------------------------------------------------------------------
# GET /preferences/sync/pull — pull preferences updated since a timestamp
# ---------------------------------------------------------------------------

@router.get("/sync/pull", summary="Sync pull preferences")
async def sync_pull(
    since: Optional[str] = Query(None, description="ISO timestamp — return only preferences updated after this time"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if since:
        rows = await execute(
            "SELECT * FROM user_preferences WHERE user_id::text = :user_id AND updated_at > :since ORDER BY updated_at ASC",
            {"user_id": user_id, "since": since},
        )
    else:
        rows = await execute(
            "SELECT * FROM user_preferences WHERE user_id::text = :user_id ORDER BY category ASC, preference_key ASC",
            {"user_id": user_id},
        )
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# GET /preferences/sync/log — sync history
# ---------------------------------------------------------------------------

@router.get("/sync/log", summary="Get sync log history")
async def get_sync_log(
    limit: int = Query(20, ge=1, le=100, description="Max entries to return"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        "SELECT * FROM preference_sync_log WHERE user_id::text = :user_id ORDER BY synced_at DESC LIMIT :limit",
        {"user_id": user_id, "limit": limit},
    )
    return [dict(row) for row in rows]
