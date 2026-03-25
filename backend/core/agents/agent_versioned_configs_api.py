"""
Agent Versioned Configs API.

Manages config snapshots for agents: create, list, activate, diff, and rollback.
Each snapshot captures the full agent config at a point in time with a version number.
"""

import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-versioned-configs"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSnapshotRequest(BaseModel):
    label: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    change_summary: Optional[str] = None


class SnapshotResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str
    version_number: int
    label: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    change_summary: Optional[str] = None
    is_active: bool = False
    created_by: str = "user"
    created_at: str


class DiffRequest(BaseModel):
    snapshot_a_id: str
    snapshot_b_id: str


class DiffEntry(BaseModel):
    key: str
    type: str  # 'added', 'removed', 'changed'
    old_value: Any = None
    new_value: Any = None


class DiffResponse(BaseModel):
    snapshot_a_id: str
    snapshot_b_id: str
    differences: List[DiffEntry] = []


# ============================================================================
# Helpers
# ============================================================================

def _row_to_snapshot(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a database row to a snapshot response dict."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "version_number": row["version_number"],
        "label": row.get("label"),
        "config": row.get("config", {}),
        "change_summary": row.get("change_summary"),
        "is_active": row.get("is_active", False),
        "created_by": row.get("created_by", "user"),
        "created_at": row["created_at"].isoformat() if hasattr(row.get("created_at", ""), "isoformat") else str(row.get("created_at", "")),
    }


def _compute_diff(config_a: Dict[str, Any], config_b: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compute key-by-key diff between two config dicts."""
    differences = []
    all_keys = set(list(config_a.keys()) + list(config_b.keys()))

    for key in sorted(all_keys):
        in_a = key in config_a
        in_b = key in config_b

        if in_a and not in_b:
            differences.append({
                "key": key,
                "type": "removed",
                "old_value": config_a[key],
                "new_value": None,
            })
        elif not in_a and in_b:
            differences.append({
                "key": key,
                "type": "added",
                "old_value": None,
                "new_value": config_b[key],
            })
        elif config_a[key] != config_b[key]:
            differences.append({
                "key": key,
                "type": "changed",
                "old_value": config_a[key],
                "new_value": config_b[key],
            })

    return differences


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/{agent_id}/config-snapshots",
    summary="Create config snapshot",
    operation_id="create_config_snapshot",
)
async def create_config_snapshot(
    agent_id: str,
    body: CreateSnapshotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new config snapshot for an agent. Auto-increments version_number."""
    try:
        # Get max version number for this agent
        max_row = await execute_one(
            "SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM agent_config_snapshots WHERE agent_id::text = :agent_id",
            {"agent_id": agent_id},
        )
        next_version = (max_row["max_ver"] if max_row else 0) + 1

        row = await execute_one(
            """
            INSERT INTO agent_config_snapshots (user_id, agent_id, version_number, label, config, change_summary, created_by)
            VALUES (:user_id, :agent_id, :version_number, :label, :config, :change_summary, 'user')
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "version_number": next_version,
                "label": body.label,
                "config": json.dumps(body.config),
                "change_summary": body.change_summary,
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create snapshot")

        return _row_to_snapshot(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating config snapshot for agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/{agent_id}/config-snapshots",
    summary="List config snapshots",
    operation_id="list_config_snapshots",
)
async def list_config_snapshots(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List config snapshots for an agent, ordered by version desc."""
    try:
        rows = await execute(
            """
            SELECT * FROM agent_config_snapshots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            ORDER BY version_number DESC
            LIMIT :limit
            """,
            {"agent_id": agent_id, "user_id": user_id, "limit": limit},
        )

        snapshots = [_row_to_snapshot(r) for r in rows]
        return {"snapshots": snapshots, "total": len(snapshots)}

    except Exception as e:
        logger.error(f"Error listing config snapshots for agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/{agent_id}/config-snapshots/{snapshot_id}",
    summary="Get config snapshot detail",
    operation_id="get_config_snapshot_detail",
)
async def get_config_snapshot_detail(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single config snapshot by ID."""
    try:
        row = await execute_one(
            """
            SELECT * FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        return _row_to_snapshot(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config snapshot {snapshot_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{agent_id}/config-snapshots/{snapshot_id}/activate",
    summary="Activate config snapshot",
    operation_id="activate_config_snapshot",
)
async def activate_config_snapshot(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set a snapshot as the active config. Deactivates others for this agent."""
    try:
        # Verify snapshot exists and belongs to user
        row = await execute_one(
            """
            SELECT id FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        # Deactivate all snapshots for this agent
        await execute_mutate(
            "UPDATE agent_config_snapshots SET is_active = false WHERE agent_id::text = :agent_id AND user_id::text = :user_id",
            {"agent_id": agent_id, "user_id": user_id},
        )

        # Activate the target snapshot
        await execute_mutate(
            "UPDATE agent_config_snapshots SET is_active = true WHERE id = :snapshot_id",
            {"snapshot_id": snapshot_id},
        )

        return {"success": True, "activated_snapshot_id": snapshot_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating config snapshot {snapshot_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{agent_id}/config-snapshots/diff",
    summary="Diff two config snapshots",
    operation_id="diff_config_snapshots",
)
async def diff_config_snapshots(
    agent_id: str,
    body: DiffRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Compare two config snapshots. Returns key-by-key diff. Caches result."""
    try:
        # Check cache first
        cached = await execute_one(
            """
            SELECT diff FROM config_diff_cache
            WHERE snapshot_a_id::text = :a_id AND snapshot_b_id::text = :b_id
            """,
            {"a_id": body.snapshot_a_id, "b_id": body.snapshot_b_id},
        )

        if cached:
            return {
                "snapshot_a_id": body.snapshot_a_id,
                "snapshot_b_id": body.snapshot_b_id,
                "differences": cached["diff"],
            }

        # Fetch both snapshots
        snap_a = await execute_one(
            """
            SELECT * FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": body.snapshot_a_id, "agent_id": agent_id, "user_id": user_id},
        )
        snap_b = await execute_one(
            """
            SELECT * FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": body.snapshot_b_id, "agent_id": agent_id, "user_id": user_id},
        )

        if not snap_a or not snap_b:
            raise HTTPException(status_code=404, detail="One or both snapshots not found")

        config_a = snap_a.get("config", {})
        config_b = snap_b.get("config", {})
        differences = _compute_diff(config_a, config_b)

        # Cache the diff
        try:
            await execute_mutate(
                """
                INSERT INTO config_diff_cache (snapshot_a_id, snapshot_b_id, diff)
                VALUES (:a_id, :b_id, :diff)
                ON CONFLICT (snapshot_a_id, snapshot_b_id) DO UPDATE SET diff = :diff, created_at = now()
                """,
                {
                    "a_id": body.snapshot_a_id,
                    "b_id": body.snapshot_b_id,
                    "diff": json.dumps(differences),
                },
            )
        except Exception as cache_err:
            logger.warning(f"Failed to cache diff: {cache_err}")

        return {
            "snapshot_a_id": body.snapshot_a_id,
            "snapshot_b_id": body.snapshot_b_id,
            "differences": differences,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error diffing config snapshots: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{agent_id}/config-snapshots/{snapshot_id}/rollback",
    summary="Rollback to a config snapshot",
    operation_id="rollback_config_snapshot",
)
async def rollback_config_snapshot(
    agent_id: str,
    snapshot_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Rollback: creates a new snapshot from the old config and sets it as active."""
    try:
        # Fetch the source snapshot
        source = await execute_one(
            """
            SELECT * FROM agent_config_snapshots
            WHERE id = :snapshot_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"snapshot_id": snapshot_id, "agent_id": agent_id, "user_id": user_id},
        )

        if not source:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        # Get next version number
        max_row = await execute_one(
            "SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM agent_config_snapshots WHERE agent_id::text = :agent_id",
            {"agent_id": agent_id},
        )
        next_version = (max_row["max_ver"] if max_row else 0) + 1

        # Deactivate all snapshots for this agent
        await execute_mutate(
            "UPDATE agent_config_snapshots SET is_active = false WHERE agent_id::text = :agent_id AND user_id::text = :user_id",
            {"agent_id": agent_id, "user_id": user_id},
        )

        # Create new snapshot from old config, set as active
        new_row = await execute_one(
            """
            INSERT INTO agent_config_snapshots (user_id, agent_id, version_number, label, config, change_summary, is_active, created_by)
            VALUES (:user_id, :agent_id, :version_number, :label, :config, :change_summary, true, 'rollback')
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "version_number": next_version,
                "label": f"Rollback from v{source['version_number']}",
                "config": json.dumps(source.get("config", {})),
                "change_summary": f"Rolled back to version {source['version_number']}" + (f" ({source.get('label', '')})" if source.get("label") else ""),
            },
        )

        if not new_row:
            raise HTTPException(status_code=500, detail="Failed to create rollback snapshot")

        return _row_to_snapshot(new_row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rolling back config snapshot {snapshot_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
