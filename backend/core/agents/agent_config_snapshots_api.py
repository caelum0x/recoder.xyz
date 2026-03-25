"""
Agent Config Snapshots API endpoints.

Provides CRUD and restore functionality for agent configuration snapshots,
allowing users to save, pin, restore, and audit agent config states.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-config-snapshots"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSnapshotRequest(BaseModel):
    snapshot_name: str
    description: Optional[str] = None
    config_data: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)


class UpdateSnapshotRequest(BaseModel):
    snapshot_name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None


class RestoreSnapshotRequest(BaseModel):
    notes: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/{agent_id}/snapshots",
    summary="Create agent config snapshot",
    operation_id="create_agent_config_snapshot",
)
async def create_snapshot(
    agent_id: str,
    body: CreateSnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new config snapshot for an agent."""
    try:
        row = await execute_one(
            """
            INSERT INTO agent_config_snapshots (
                user_id, agent_id, snapshot_name, description,
                config_data, tags
            ) VALUES (
                :user_id, :agent_id, :snapshot_name, :description,
                :config_data::jsonb, :tags
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "snapshot_name": body.snapshot_name,
                "description": body.description,
                "config_data": __import__("json").dumps(body.config_data),
                "tags": body.tags,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating snapshot for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create snapshot")


@router.get(
    "/{agent_id}/snapshots/stats",
    summary="Get agent config snapshot stats",
    operation_id="get_agent_config_snapshot_stats",
)
async def get_snapshot_stats(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get snapshot stats: total count, pinned count, most restored snapshot."""
    try:
        totals = await execute_one(
            """
            SELECT
                COUNT(*) AS total_snapshots,
                COUNT(*) FILTER (WHERE is_pinned = true) AS pinned_count
            FROM agent_config_snapshots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        most_restored = await execute_one(
            """
            SELECT id, snapshot_name, restored_count
            FROM agent_config_snapshots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
              AND restored_count > 0
            ORDER BY restored_count DESC
            LIMIT 1
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        return {
            "total_snapshots": totals["total_snapshots"] if totals else 0,
            "pinned_count": totals["pinned_count"] if totals else 0,
            "most_restored": serialize_row(most_restored) if most_restored else None,
        }
    except Exception as e:
        logger.error(f"Error fetching snapshot stats for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch snapshot stats")


@router.get(
    "/{agent_id}/snapshots",
    summary="List agent config snapshots",
    operation_id="list_agent_config_snapshots",
)
async def list_snapshots(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    pinned_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
):
    """List config snapshots for an agent, most recent first."""
    try:
        query = """
            SELECT * FROM agent_config_snapshots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
        """
        params: Dict[str, Any] = {"agent_id": agent_id, "user_id": user_id, "limit": limit}

        if pinned_only:
            query += " AND is_pinned = true"

        query += " ORDER BY created_at DESC LIMIT :limit"

        rows = await execute(query, params)
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing snapshots for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list snapshots")


@router.get(
    "/{agent_id}/snapshots/{snapshot_id}",
    summary="Get agent config snapshot detail",
    operation_id="get_agent_config_snapshot",
)
async def get_snapshot(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get snapshot detail with recent restore log entries."""
    try:
        snapshot = await execute_one(
            """
            SELECT * FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not snapshot:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        restore_log = await execute(
            """
            SELECT * FROM snapshot_restore_log
            WHERE snapshot_id::text = :snapshot_id AND user_id::text = :user_id
            ORDER BY restored_at DESC
            LIMIT 20
            """,
            {"snapshot_id": snapshot_id, "user_id": user_id},
        )

        result = serialize_row(snapshot)
        result["restore_log"] = serialize_rows(restore_log) if restore_log else []
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching snapshot {snapshot_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch snapshot")


@router.patch(
    "/{agent_id}/snapshots/{snapshot_id}",
    summary="Update agent config snapshot",
    operation_id="update_agent_config_snapshot",
)
async def update_snapshot(
    agent_id: str,
    snapshot_id: str,
    body: UpdateSnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update snapshot name, description, tags, or pin status."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        updates = []
        params: Dict[str, Any] = {"snapshot_id": snapshot_id, "user_id": user_id}

        if body.snapshot_name is not None:
            updates.append("snapshot_name = :snapshot_name")
            params["snapshot_name"] = body.snapshot_name
        if body.description is not None:
            updates.append("description = :description")
            params["description"] = body.description
        if body.tags is not None:
            updates.append("tags = :tags")
            params["tags"] = body.tags
        if body.is_pinned is not None:
            updates.append("is_pinned = :is_pinned")
            params["is_pinned"] = body.is_pinned

        if not updates:
            snapshot = await execute_one(
                "SELECT * FROM agent_config_snapshots WHERE id = :snapshot_id AND user_id::text = :user_id",
                {"snapshot_id": snapshot_id, "user_id": user_id},
            )
            return serialize_row(snapshot)

        set_clause = ", ".join(updates)
        row = await execute_one(
            f"""
            UPDATE agent_config_snapshots
            SET {set_clause}
            WHERE id = :snapshot_id AND user_id::text = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating snapshot {snapshot_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update snapshot")


@router.delete(
    "/{agent_id}/snapshots/{snapshot_id}",
    summary="Delete agent config snapshot",
    operation_id="delete_agent_config_snapshot",
)
async def delete_snapshot(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a config snapshot."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        await execute_mutate(
            "DELETE FROM agent_config_snapshots WHERE id = :snapshot_id AND user_id::text = :user_id",
            {"snapshot_id": snapshot_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting snapshot {snapshot_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete snapshot")


@router.post(
    "/{agent_id}/snapshots/{snapshot_id}/restore",
    summary="Restore agent config snapshot",
    operation_id="restore_agent_config_snapshot",
)
async def restore_snapshot(
    agent_id: str,
    snapshot_id: str,
    body: RestoreSnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a snapshot as restored: increments restored_count and logs the restore."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        # Increment restore count
        updated = await execute_one(
            """
            UPDATE agent_config_snapshots
            SET restored_count = restored_count + 1
            WHERE id = :snapshot_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"snapshot_id": snapshot_id, "user_id": user_id},
        )

        # Log the restore
        log_entry = await execute_one(
            """
            INSERT INTO snapshot_restore_log (snapshot_id, user_id, agent_id, notes)
            VALUES (:snapshot_id, :user_id, :agent_id, :notes)
            RETURNING *
            """,
            {
                "snapshot_id": snapshot_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "notes": body.notes,
            },
        )

        return {
            "snapshot": serialize_row(updated),
            "log_entry": serialize_row(log_entry),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring snapshot {snapshot_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to restore snapshot")


@router.get(
    "/{agent_id}/snapshots/{snapshot_id}/restore-log",
    summary="List snapshot restore log",
    operation_id="list_snapshot_restore_log",
)
async def list_restore_log(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
):
    """List restore history for a specific snapshot."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        rows = await execute(
            """
            SELECT * FROM snapshot_restore_log
            WHERE snapshot_id::text = :snapshot_id AND user_id::text = :user_id
            ORDER BY restored_at DESC
            LIMIT :limit
            """,
            {"snapshot_id": snapshot_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing restore log for snapshot {snapshot_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list restore log")
