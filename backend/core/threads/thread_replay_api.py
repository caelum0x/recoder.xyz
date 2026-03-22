"""
Thread Replay API endpoints (Sprint 73 Phase 2).

Provides checkpoint creation and replay management for threads.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import json
from datetime import datetime, timezone
from typing import Optional, Any, Dict

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-replay"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateCheckpointRequest(BaseModel):
    checkpoint_name: Optional[str] = None
    message_index: int
    messages_snapshot: Any  # list of message objects
    agent_config_snapshot: Optional[Any] = None


class CreateReplayRequest(BaseModel):
    checkpoint_id: str
    agent_id: Optional[str] = None
    agent_config_override: Optional[Any] = None
    replay_thread_id: Optional[str] = None


class UpdateReplayRequest(BaseModel):
    comparison_notes: Optional[str] = None
    status: Optional[str] = None


# ============================================================================
# Checkpoint Endpoints
# ============================================================================

@router.post(
    "/threads/{thread_id}/checkpoints",
    summary="Create thread checkpoint",
    operation_id="create_thread_checkpoint",
)
async def create_thread_checkpoint(
    thread_id: str,
    body: CreateCheckpointRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a checkpoint snapshot for a thread at a given message index."""
    try:
        messages_json = json.dumps(body.messages_snapshot if body.messages_snapshot is not None else [])
        config_json = json.dumps(body.agent_config_snapshot if body.agent_config_snapshot is not None else {})

        row = await execute_one(
            """
            INSERT INTO thread_checkpoints
              (user_id, thread_id, checkpoint_name, message_index, messages_snapshot, agent_config_snapshot)
            VALUES
              (:user_id, :thread_id, :checkpoint_name, :message_index, :messages_snapshot::jsonb, :agent_config_snapshot::jsonb)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "checkpoint_name": body.checkpoint_name,
                "message_index": body.message_index,
                "messages_snapshot": messages_json,
                "agent_config_snapshot": config_json,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"create_thread_checkpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create thread checkpoint.")


@router.get(
    "/threads/{thread_id}/checkpoints",
    summary="List thread checkpoints",
    operation_id="list_thread_checkpoints",
)
async def list_thread_checkpoints(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all checkpoints for a thread."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_checkpoints
            WHERE thread_id = :thread_id AND user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_thread_checkpoints error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list thread checkpoints.")


@router.delete(
    "/threads/{thread_id}/checkpoints/{checkpoint_id}",
    summary="Delete thread checkpoint",
    operation_id="delete_thread_checkpoint",
)
async def delete_thread_checkpoint(
    thread_id: str,
    checkpoint_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a checkpoint."""
    try:
        row = await execute_one(
            "SELECT id FROM thread_checkpoints WHERE id = :id AND thread_id = :thread_id AND user_id = :user_id",
            {"id": checkpoint_id, "thread_id": thread_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Checkpoint not found.")

        await execute_mutate(
            "DELETE FROM thread_checkpoints WHERE id = :id AND user_id = :user_id",
            {"id": checkpoint_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_thread_checkpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete thread checkpoint.")


# ============================================================================
# Replay Endpoints
# ============================================================================

@router.post(
    "/threads/{thread_id}/replay",
    summary="Create thread replay",
    operation_id="create_thread_replay",
)
async def create_thread_replay(
    thread_id: str,
    body: CreateReplayRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a replay from a checkpoint. Immediately sets status=completed (simulated)."""
    try:
        # Verify checkpoint ownership
        checkpoint = await execute_one(
            "SELECT id FROM thread_checkpoints WHERE id = :id AND user_id = :user_id",
            {"id": body.checkpoint_id, "user_id": user_id},
        )
        if not checkpoint:
            raise HTTPException(status_code=404, detail="Checkpoint not found.")

        override_json = json.dumps(body.agent_config_override if body.agent_config_override is not None else {})
        now = datetime.now(timezone.utc).isoformat()

        row = await execute_one(
            """
            INSERT INTO thread_replays
              (user_id, source_thread_id, checkpoint_id, replay_thread_id, agent_id,
               agent_config_override, status, completed_at)
            VALUES
              (:user_id, :source_thread_id, :checkpoint_id, :replay_thread_id, :agent_id,
               :agent_config_override::jsonb, 'completed', :completed_at)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "source_thread_id": thread_id,
                "checkpoint_id": body.checkpoint_id,
                "replay_thread_id": body.replay_thread_id,
                "agent_id": body.agent_id,
                "agent_config_override": override_json,
                "completed_at": now,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_thread_replay error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create thread replay.")


@router.get(
    "/threads/{thread_id}/replays",
    summary="List thread replays",
    operation_id="list_thread_replays",
)
async def list_thread_replays(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all replays for a source thread."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_replays
            WHERE source_thread_id = :thread_id AND user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_thread_replays error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list thread replays.")


@router.get(
    "/replays/{replay_id}",
    summary="Get replay detail",
    operation_id="get_replay_detail",
)
async def get_replay_detail(
    replay_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a replay with joined checkpoint data."""
    try:
        row = await execute_one(
            """
            SELECT r.*,
                   c.checkpoint_name,
                   c.message_index,
                   c.messages_snapshot,
                   c.agent_config_snapshot,
                   c.thread_id AS checkpoint_thread_id
            FROM thread_replays r
            LEFT JOIN thread_checkpoints c ON c.id = r.checkpoint_id
            WHERE r.id = :id AND r.user_id = :user_id
            """,
            {"id": replay_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Replay not found.")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_replay_detail error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get replay detail.")


@router.patch(
    "/replays/{replay_id}",
    summary="Update replay",
    operation_id="update_replay",
)
async def update_replay(
    replay_id: str,
    body: UpdateReplayRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update comparison notes or status for a replay."""
    try:
        row = await execute_one(
            "SELECT * FROM thread_replays WHERE id = :id AND user_id = :user_id",
            {"id": replay_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Replay not found.")

        existing = serialize_row(row)
        new_notes = body.comparison_notes if body.comparison_notes is not None else existing.get("comparison_notes")
        new_status = body.status if body.status is not None else existing.get("status")

        updated = await execute_one(
            """
            UPDATE thread_replays
            SET comparison_notes = :comparison_notes, status = :status
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            {
                "id": replay_id,
                "user_id": user_id,
                "comparison_notes": new_notes,
                "status": new_status,
            },
        )
        return serialize_row(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_replay error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update replay.")


@router.delete(
    "/replays/{replay_id}",
    summary="Delete replay",
    operation_id="delete_replay",
)
async def delete_replay(
    replay_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a replay."""
    try:
        row = await execute_one(
            "SELECT id FROM thread_replays WHERE id = :id AND user_id = :user_id",
            {"id": replay_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Replay not found.")

        await execute_mutate(
            "DELETE FROM thread_replays WHERE id = :id AND user_id = :user_id",
            {"id": replay_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_replay error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete replay.")
