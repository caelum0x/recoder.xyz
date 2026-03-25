"""
Sprint 57 Phase 5: Custom Keyboard Shortcuts API

CRUD endpoints for user keyboard shortcuts with batch upsert,
individual reset, and full reset-to-defaults.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/shortcuts", tags=["keyboard-shortcuts"])


class ShortcutItem(BaseModel):
    action: str
    key_combo: str
    is_active: Optional[bool] = True


class SetShortcutsRequest(BaseModel):
    shortcuts: List[ShortcutItem]


@router.get("", summary="List user keyboard shortcuts")
async def list_shortcuts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        "SELECT * FROM user_keyboard_shortcuts WHERE user_id::text = :user_id ORDER BY action ASC",
        {"user_id": user_id},
    )
    return [dict(row) for row in rows]


@router.put("", summary="Batch set keyboard shortcuts")
async def set_shortcuts(
    body: SetShortcutsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.shortcuts:
        raise HTTPException(status_code=400, detail="shortcuts list is required")

    results = []
    for shortcut in body.shortcuts:
        if not shortcut.action or not shortcut.action.strip():
            raise HTTPException(status_code=400, detail="action is required for each shortcut")
        if not shortcut.key_combo or not shortcut.key_combo.strip():
            raise HTTPException(status_code=400, detail="key_combo is required for each shortcut")

        row = await execute_one(
            """
            INSERT INTO user_keyboard_shortcuts (user_id, action, key_combo, is_active)
            VALUES (:user_id, :action, :key_combo, :is_active)
            ON CONFLICT (user_id, action) DO UPDATE SET
                key_combo = EXCLUDED.key_combo,
                is_active = EXCLUDED.is_active
            RETURNING *
            """,
            {
                "user_id": user_id,
                "action": shortcut.action.strip(),
                "key_combo": shortcut.key_combo.strip(),
                "is_active": shortcut.is_active if shortcut.is_active is not None else True,
            },
            commit=True,
        )
        if row:
            results.append(dict(row))

    return results


@router.delete("/{action}", summary="Reset a single shortcut to default")
async def reset_shortcut(
    action: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM user_keyboard_shortcuts WHERE user_id::text = :user_id AND action = :action",
        {"user_id": user_id, "action": action},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Shortcut not found")

    await execute_mutate(
        "DELETE FROM user_keyboard_shortcuts WHERE user_id::text = :user_id AND action = :action",
        {"user_id": user_id, "action": action},
    )
    return {"status": "ok"}


@router.post("/reset-all", summary="Reset all shortcuts to defaults")
async def reset_all_shortcuts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute_mutate(
        "DELETE FROM user_keyboard_shortcuts WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )
    return {"status": "ok"}
