"""
Sprint 58 Phase 5: Command Palette API

CRUD endpoints for command history, frequent commands, and pinned commands.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/commands", tags=["command-palette"])


class RecordCommandRequest(BaseModel):
    command: str
    command_type: str
    metadata: Optional[dict] = None


class PinCommandRequest(BaseModel):
    command: str
    command_type: str
    label: str


VALID_COMMAND_TYPES = {"navigation", "action", "agent", "thread", "search", "setting"}


@router.post("/history", summary="Record command execution")
async def record_command(
    body: RecordCommandRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.command or not body.command.strip():
        raise HTTPException(status_code=400, detail="command is required")
    if body.command_type not in VALID_COMMAND_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"command_type must be one of: {', '.join(sorted(VALID_COMMAND_TYPES))}",
        )

    row = await execute_one(
        """
        INSERT INTO command_palette_history (user_id, command, command_type, metadata)
        VALUES (:user_id, :command, :command_type, :metadata::jsonb)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "command": body.command.strip(),
            "command_type": body.command_type,
            "metadata": body.metadata or {},
        },
        commit=True,
    )
    return dict(row) if row else {"status": "ok"}


@router.get("/history", summary="Get recent command history")
async def get_history(
    limit: int = Query(default=20, ge=1, le=100),
    command_type: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if command_type and command_type not in VALID_COMMAND_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"command_type must be one of: {', '.join(sorted(VALID_COMMAND_TYPES))}",
        )

    if command_type:
        rows = await execute(
            """
            SELECT * FROM command_palette_history
            WHERE user_id::text = :user_id AND command_type = :command_type
            ORDER BY executed_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "command_type": command_type, "limit": limit},
        )
    else:
        rows = await execute(
            """
            SELECT * FROM command_palette_history
            WHERE user_id::text = :user_id
            ORDER BY executed_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )

    return [dict(row) for row in rows]


@router.get("/frequent", summary="Get most frequently used commands")
async def get_frequent(
    limit: int = Query(default=10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT command, command_type, COUNT(*) as use_count, MAX(executed_at) as last_used
        FROM command_palette_history
        WHERE user_id::text = :user_id
        GROUP BY command, command_type
        ORDER BY use_count DESC, last_used DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )
    return [dict(row) for row in rows]


@router.post("/pins", summary="Pin a command")
async def pin_command(
    body: PinCommandRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.command or not body.command.strip():
        raise HTTPException(status_code=400, detail="command is required")
    if not body.label or not body.label.strip():
        raise HTTPException(status_code=400, detail="label is required")

    # Get the next sort_order
    max_order = await execute_one(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM command_palette_pins WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )
    next_order = max_order["next_order"] if max_order else 0

    row = await execute_one(
        """
        INSERT INTO command_palette_pins (user_id, command, command_type, label, sort_order)
        VALUES (:user_id, :command, :command_type, :label, :sort_order)
        ON CONFLICT (user_id, command) DO UPDATE SET
            label = EXCLUDED.label,
            command_type = EXCLUDED.command_type
        RETURNING *
        """,
        {
            "user_id": user_id,
            "command": body.command.strip(),
            "command_type": body.command_type,
            "label": body.label.strip(),
            "sort_order": next_order,
        },
        commit=True,
    )
    return dict(row) if row else {"status": "ok"}


@router.get("/pins", summary="List pinned commands")
async def list_pins(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM command_palette_pins
        WHERE user_id::text = :user_id
        ORDER BY sort_order ASC
        """,
        {"user_id": user_id},
    )
    return [dict(row) for row in rows]


@router.delete("/pins/{pin_id}", summary="Unpin a command")
async def unpin_command(
    pin_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM command_palette_pins WHERE id = :pin_id AND user_id::text = :user_id",
        {"pin_id": pin_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pinned command not found")

    await execute_mutate(
        "DELETE FROM command_palette_pins WHERE id = :pin_id AND user_id::text = :user_id",
        {"pin_id": pin_id, "user_id": user_id},
    )
    return {"status": "ok"}
