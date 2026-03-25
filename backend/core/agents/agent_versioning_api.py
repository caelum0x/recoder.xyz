"""
Agent Configuration Versioning API.

Provides point-in-time snapshots of agent configuration with diff,
restore, and listing capabilities.  Complements the existing
agent_versions system by capturing full config JSON snapshots.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-versioning"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateConfigVersionRequest(BaseModel):
    name: Optional[str] = Field(None, description="Human-readable name for this snapshot")
    description: Optional[str] = Field(None, description="Description of what changed")


class ConfigVersionResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str
    version_number: int
    name: Optional[str] = None
    description: Optional[str] = None
    config_snapshot: Dict[str, Any]
    created_at: str


class ConfigVersionListResponse(BaseModel):
    versions: List[ConfigVersionResponse]
    total: int


class ConfigVersionDiffField(BaseModel):
    field: str
    type: str  # 'added', 'removed', 'modified'
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None


class ConfigVersionDiffResponse(BaseModel):
    from_version: int
    to_version: int
    differences: List[ConfigVersionDiffField]


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    """Convert a datetime or string to ISO string."""
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_response(row: Dict[str, Any]) -> ConfigVersionResponse:
    """Convert a DB row to a ConfigVersionResponse."""
    return ConfigVersionResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        agent_id=str(row["agent_id"]),
        version_number=row["version_number"],
        name=row.get("name"),
        description=row.get("description"),
        config_snapshot=row.get("config_snapshot") or {},
        created_at=_ts(row.get("created_at")),
    )


async def _get_agent_config(agent_id: str, user_id: str) -> Dict[str, Any]:
    """Read current agent configuration from the agents table."""
    agent_row = await execute_one(
        """SELECT agent_id, name, system_prompt, model, model_provider,
                  agentpress_tools, configured_mcps, custom_mcps, is_default,
                  avatar_url, metadata, icon_name, icon_color, icon_background
           FROM agents
           WHERE agent_id::text = :agent_id AND account_id::text = :user_id""",
        {"agent_id": agent_id, "user_id": user_id},
    )
    if not agent_row:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {
        "name": agent_row.get("name"),
        "system_prompt": agent_row.get("system_prompt"),
        "model": agent_row.get("model"),
        "model_provider": agent_row.get("model_provider"),
        "is_default": agent_row.get("is_default", False),
        "icon_name": agent_row.get("icon_name"),
        "icon_color": agent_row.get("icon_color"),
        "icon_background": agent_row.get("icon_background"),
        "agentpress_tools": agent_row.get("agentpress_tools") or {},
        "configured_mcps": agent_row.get("configured_mcps") or [],
        "custom_mcps": agent_row.get("custom_mcps") or [],
        "metadata": agent_row.get("metadata") or {},
    }


def _compute_diff(old_config: Dict[str, Any], new_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compute field-level differences between two config snapshots."""
    differences: List[Dict[str, Any]] = []
    all_keys = set(list(old_config.keys()) + list(new_config.keys()))

    for key in sorted(all_keys):
        old_val = old_config.get(key)
        new_val = new_config.get(key)

        if key not in old_config:
            differences.append({
                "field": key,
                "type": "added",
                "old_value": None,
                "new_value": new_val,
            })
        elif key not in new_config:
            differences.append({
                "field": key,
                "type": "removed",
                "old_value": old_val,
                "new_value": None,
            })
        elif old_val != new_val:
            differences.append({
                "field": key,
                "type": "modified",
                "old_value": old_val,
                "new_value": new_val,
            })

    return differences


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/config-versions",
    response_model=ConfigVersionResponse,
    summary="Snapshot current agent config",
    operation_id="create_config_version",
)
async def create_config_version(
    agent_id: str,
    body: CreateConfigVersionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a point-in-time snapshot of the agent's current configuration."""
    try:
        # Capture current config
        config_snapshot = await _get_agent_config(agent_id, user_id)

        # Determine next version number
        max_row = await execute_one(
            "SELECT COALESCE(MAX(version_number), 0) AS max_num FROM agent_config_versions WHERE agent_id::text = :agent_id",
            {"agent_id": agent_id},
        )
        next_version = (max_row["max_num"] if max_row else 0) + 1

        # Default name if not provided
        name = body.name or f"Snapshot v{next_version}"

        row = await execute_one(
            """INSERT INTO agent_config_versions (user_id, agent_id, version_number, name, description, config_snapshot)
               VALUES (:user_id, :agent_id, :version_number, :name, :description, :config_snapshot)
               RETURNING id, user_id, agent_id, version_number, name, description, config_snapshot, created_at""",
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "version_number": next_version,
                "name": name,
                "description": body.description,
                "config_snapshot": json.dumps(config_snapshot),
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create config version")

        return _row_to_response(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating config version for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create config version")


@router.get(
    "/agents/{agent_id}/config-versions",
    response_model=ConfigVersionListResponse,
    summary="List agent config versions",
    operation_id="list_config_versions",
)
async def list_config_versions(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all configuration snapshots for an agent, newest first."""
    try:
        # Verify ownership
        agent_check = await execute_one(
            "SELECT agent_id FROM agents WHERE agent_id::text = :agent_id AND account_id::text = :user_id",
            {"agent_id": agent_id, "user_id": user_id},
        )
        if not agent_check:
            raise HTTPException(status_code=404, detail="Agent not found")

        count_row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM agent_config_versions WHERE agent_id::text = :agent_id AND user_id::text = :user_id",
            {"agent_id": agent_id, "user_id": user_id},
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            """SELECT id, user_id, agent_id, version_number, name, description, config_snapshot, created_at
               FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND user_id::text = :user_id
               ORDER BY version_number DESC
               LIMIT :limit OFFSET :offset""",
            {"agent_id": agent_id, "user_id": user_id, "limit": limit, "offset": offset},
        )

        return ConfigVersionListResponse(
            versions=[_row_to_response(r) for r in (rows or [])],
            total=total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing config versions for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list config versions")


@router.get(
    "/agents/{agent_id}/config-versions/{version_number}",
    response_model=ConfigVersionResponse,
    summary="Get config version detail",
    operation_id="get_config_version",
)
async def get_config_version(
    agent_id: str,
    version_number: int,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a specific configuration snapshot by version number."""
    try:
        row = await execute_one(
            """SELECT id, user_id, agent_id, version_number, name, description, config_snapshot, created_at
               FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND version_number = :version_number AND user_id::text = :user_id""",
            {"agent_id": agent_id, "version_number": version_number, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Config version not found")

        return _row_to_response(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config version {version_number} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get config version")


@router.post(
    "/agents/{agent_id}/config-versions/{version_number}/restore",
    response_model=ConfigVersionResponse,
    summary="Restore agent config from snapshot",
    operation_id="restore_config_version",
)
async def restore_config_version(
    agent_id: str,
    version_number: int,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Restore agent configuration from a snapshot.
    This writes the snapshot's config back to the agents table and creates
    a new snapshot of the restored state.
    """
    try:
        # Fetch the target snapshot
        row = await execute_one(
            """SELECT config_snapshot FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND version_number = :version_number AND user_id::text = :user_id""",
            {"agent_id": agent_id, "version_number": version_number, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Config version not found")

        snapshot = row["config_snapshot"]
        if isinstance(snapshot, str):
            snapshot = json.loads(snapshot)

        # Apply snapshot back to agents table
        await execute_mutate(
            """UPDATE agents SET
                   system_prompt = :system_prompt,
                   model = :model,
                   model_provider = :model_provider,
                   agentpress_tools = :agentpress_tools,
                   configured_mcps = :configured_mcps,
                   custom_mcps = :custom_mcps,
                   icon_name = :icon_name,
                   icon_color = :icon_color,
                   icon_background = :icon_background
               WHERE agent_id::text = :agent_id AND account_id::text = :user_id""",
            {
                "agent_id": agent_id,
                "user_id": user_id,
                "system_prompt": snapshot.get("system_prompt"),
                "model": snapshot.get("model"),
                "model_provider": snapshot.get("model_provider"),
                "agentpress_tools": json.dumps(snapshot.get("agentpress_tools") or {}),
                "configured_mcps": json.dumps(snapshot.get("configured_mcps") or []),
                "custom_mcps": json.dumps(snapshot.get("custom_mcps") or []),
                "icon_name": snapshot.get("icon_name"),
                "icon_color": snapshot.get("icon_color"),
                "icon_background": snapshot.get("icon_background"),
            },
        )

        # Create a new snapshot recording the restore
        max_row = await execute_one(
            "SELECT COALESCE(MAX(version_number), 0) AS max_num FROM agent_config_versions WHERE agent_id::text = :agent_id",
            {"agent_id": agent_id},
        )
        next_version = (max_row["max_num"] if max_row else 0) + 1

        new_row = await execute_one(
            """INSERT INTO agent_config_versions (user_id, agent_id, version_number, name, description, config_snapshot)
               VALUES (:user_id, :agent_id, :version_number, :name, :description, :config_snapshot)
               RETURNING id, user_id, agent_id, version_number, name, description, config_snapshot, created_at""",
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "version_number": next_version,
                "name": f"Restored from v{version_number}",
                "description": f"Configuration restored from snapshot v{version_number}",
                "config_snapshot": json.dumps(snapshot),
            },
            commit=True,
        )

        if not new_row:
            raise HTTPException(status_code=500, detail="Failed to record restore snapshot")

        return _row_to_response(new_row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring config version {version_number} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to restore config version")


@router.get(
    "/agents/{agent_id}/config-versions/diff",
    response_model=ConfigVersionDiffResponse,
    summary="Compare two config versions",
    operation_id="diff_config_versions",
)
async def diff_config_versions(
    agent_id: str,
    from_version: int = Query(..., description="Source version number"),
    to_version: int = Query(..., description="Target version number"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Compare two configuration snapshots and return field-level differences."""
    try:
        from_row = await execute_one(
            """SELECT config_snapshot FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND version_number = :version_number AND user_id::text = :user_id""",
            {"agent_id": agent_id, "version_number": from_version, "user_id": user_id},
        )
        if not from_row:
            raise HTTPException(status_code=404, detail=f"Config version {from_version} not found")

        to_row = await execute_one(
            """SELECT config_snapshot FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND version_number = :version_number AND user_id::text = :user_id""",
            {"agent_id": agent_id, "version_number": to_version, "user_id": user_id},
        )
        if not to_row:
            raise HTTPException(status_code=404, detail=f"Config version {to_version} not found")

        from_config = from_row["config_snapshot"]
        to_config = to_row["config_snapshot"]

        if isinstance(from_config, str):
            from_config = json.loads(from_config)
        if isinstance(to_config, str):
            to_config = json.loads(to_config)

        diffs = _compute_diff(from_config, to_config)

        return ConfigVersionDiffResponse(
            from_version=from_version,
            to_version=to_version,
            differences=[ConfigVersionDiffField(**d) for d in diffs],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error diffing config versions for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to diff config versions")


@router.delete(
    "/agents/{agent_id}/config-versions/{version_number}",
    summary="Delete a config version",
    operation_id="delete_config_version",
)
async def delete_config_version(
    agent_id: str,
    version_number: int,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific configuration snapshot."""
    try:
        row = await execute_one(
            """DELETE FROM agent_config_versions
               WHERE agent_id::text = :agent_id AND version_number = :version_number AND user_id::text = :user_id
               RETURNING id""",
            {"agent_id": agent_id, "version_number": version_number, "user_id": user_id},
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=404, detail="Config version not found")

        return {"deleted": True, "version_number": version_number}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting config version {version_number} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete config version")
