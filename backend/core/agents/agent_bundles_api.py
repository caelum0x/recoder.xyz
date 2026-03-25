"""
Agent Export/Import Bundles API.

Manage reusable agent bundles for export, import, and sharing.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["agent-bundles"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ExportBundleRequest(BaseModel):
    bundle_name: str = Field(..., min_length=1, max_length=200)
    bundle_type: str = Field(default="full")
    included_sections: Optional[List[str]] = None
    is_public: bool = False


class ImportBundleRequest(BaseModel):
    bundle_id: Optional[str] = None
    bundle_data: Optional[Dict[str, Any]] = None


# ============================================================================
# Helpers
# ============================================================================

def _compute_checksum(data: dict) -> str:
    """Compute a sha256 checksum for bundle config data."""
    raw = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def _build_bundle_config(
    agent_id: str,
    user_id: str,
    included_sections: List[str],
) -> Dict[str, Any]:
    """Build bundle config data from agent, respecting included_sections."""

    agent_row = await execute_one(
        """SELECT agent_id, name, description, system_prompt, model, model_provider,
                  agentpress_tools, configured_mcps, custom_mcps, is_default,
                  avatar_url, metadata, icon_name, icon_color, icon_background
           FROM agents
           WHERE agent_id::text = :agent_id AND account_id::text = :user_id""",
        {"agent_id": agent_id, "user_id": user_id},
    )
    if not agent_row:
        raise HTTPException(status_code=404, detail="Agent not found")

    config: Dict[str, Any] = {
        "agent": {
            "name": agent_row["name"],
            "description": agent_row.get("description"),
            "icon_name": agent_row.get("icon_name"),
            "icon_color": agent_row.get("icon_color"),
            "icon_background": agent_row.get("icon_background"),
            "is_default": agent_row.get("is_default", False),
            "metadata": agent_row.get("metadata"),
        }
    }

    if "instructions" in included_sections:
        config["instructions"] = {
            "system_prompt": agent_row.get("system_prompt"),
        }

    if "model" in included_sections:
        config["model"] = {
            "model": agent_row.get("model"),
            "model_provider": agent_row.get("model_provider"),
        }

    if "tools" in included_sections:
        config["tools"] = {}
        if agent_row.get("agentpress_tools"):
            config["tools"]["agentpress_tools"] = agent_row["agentpress_tools"]
        if agent_row.get("configured_mcps"):
            config["tools"]["configured_mcps"] = agent_row["configured_mcps"]
        if agent_row.get("custom_mcps"):
            config["tools"]["custom_mcps"] = agent_row["custom_mcps"]

    if "env_vars" in included_sections:
        try:
            secret_rows = await execute(
                "SELECT key FROM agent_secrets WHERE agent_id::text = :agent_id AND user_id::text = :user_id ORDER BY key",
                {"agent_id": agent_id, "user_id": user_id},
            )
            config["env_var_keys"] = [r["key"] for r in (secret_rows or [])]
        except Exception as e:
            logger.debug(f"Could not fetch env vars for bundle: {e}")
            config["env_var_keys"] = []

    if "triggers" in included_sections:
        try:
            sched_rows = await execute(
                """SELECT name, cron_expression, timezone, input_message, is_active, max_runs
                   FROM agent_schedules
                   WHERE agent_id::text = :agent_id AND user_id::text = :user_id
                   ORDER BY created_at""",
                {"agent_id": agent_id, "user_id": user_id},
            )
            config["triggers"] = [
                {
                    "name": r["name"],
                    "cron_expression": r["cron_expression"],
                    "timezone": r.get("timezone", "UTC"),
                    "input_message": r.get("input_message"),
                    "is_active": r.get("is_active", True),
                    "max_runs": r.get("max_runs"),
                }
                for r in (sched_rows or [])
            ]
        except Exception as e:
            logger.debug(f"Could not fetch triggers for bundle: {e}")
            config["triggers"] = []

    if "kb_refs" in included_sections:
        try:
            kb_rows = await execute(
                """SELECT id, title, content_type, file_name, description
                   FROM knowledge_base_items
                   WHERE agent_id::text = :agent_id AND user_id::text = :user_id
                   ORDER BY created_at""",
                {"agent_id": agent_id, "user_id": user_id},
            )
            config["kb_refs"] = [
                {
                    "title": r.get("title") or r.get("file_name", "Untitled"),
                    "content_type": r.get("content_type"),
                    "description": r.get("description"),
                }
                for r in (kb_rows or [])
            ]
        except Exception as e:
            logger.debug(f"Could not fetch KB refs for bundle: {e}")
            config["kb_refs"] = []

    return config


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/agents/{agent_id}/bundle-export", summary="Export agent as bundle")
async def export_agent_bundle(
    agent_id: str,
    body: ExportBundleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export an agent configuration as a reusable bundle."""
    try:
        if body.bundle_type not in ("full", "config_only", "template"):
            raise HTTPException(status_code=400, detail="Invalid bundle_type")

        default_sections = ["instructions", "tools", "model", "env_vars", "triggers", "kb_refs"]
        included = body.included_sections if body.included_sections else default_sections

        config_data = await _build_bundle_config(agent_id, user_id, included)

        config_json = json.dumps(config_data, default=str)
        file_size = len(config_json.encode("utf-8"))
        checksum = _compute_checksum(config_data)

        row = await execute_one(
            """INSERT INTO agent_bundles
                   (user_id, agent_id, bundle_name, bundle_version, bundle_type,
                    config_data, included_sections, file_size_bytes, checksum, is_public)
               VALUES
                   (:user_id, :agent_id, :bundle_name, '1.0.0', :bundle_type,
                    :config_data, :included_sections, :file_size_bytes, :checksum, :is_public)
               RETURNING *""",
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "bundle_name": body.bundle_name.strip(),
                "bundle_type": body.bundle_type,
                "config_data": config_json,
                "included_sections": included,
                "file_size_bytes": file_size,
                "checksum": checksum,
                "is_public": body.is_public,
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create bundle")

        result = dict(row)
        # Ensure config_data is returned as parsed JSON
        if isinstance(result.get("config_data"), str):
            result["config_data"] = json.loads(result["config_data"])
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting agent bundle {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export agent bundle")


@router.post("/agents/bundle-import", summary="Import agent from bundle")
async def import_agent_from_bundle(
    body: ImportBundleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Import an agent from a bundle (by bundle ID or inline data)."""
    try:
        config_data = None

        if body.bundle_id:
            bundle_row = await execute_one(
                """SELECT config_data, is_public, user_id as owner_id
                   FROM agent_bundles WHERE id = :bundle_id""",
                {"bundle_id": body.bundle_id},
            )
            if not bundle_row:
                raise HTTPException(status_code=404, detail="Bundle not found")

            # Allow access if user owns the bundle or it is public
            if str(bundle_row["owner_id"]) != user_id and not bundle_row.get("is_public"):
                raise HTTPException(status_code=403, detail="Access denied")

            config_data = bundle_row["config_data"]
            if isinstance(config_data, str):
                config_data = json.loads(config_data)

        elif body.bundle_data:
            config_data = body.bundle_data
        else:
            raise HTTPException(status_code=400, detail="Provide bundle_id or bundle_data")

        agent_info = config_data.get("agent", {})
        agent_name = agent_info.get("name", "Imported Agent")

        import uuid
        new_agent_id = str(uuid.uuid4())

        # Build agent insert params
        system_prompt = None
        if "instructions" in config_data:
            system_prompt = config_data["instructions"].get("system_prompt")

        model = None
        model_provider = None
        if "model" in config_data:
            model = config_data["model"].get("model")
            model_provider = config_data["model"].get("model_provider")

        agentpress_tools = None
        configured_mcps = None
        custom_mcps = None
        if "tools" in config_data:
            tools = config_data["tools"]
            agentpress_tools = json.dumps(tools["agentpress_tools"]) if tools.get("agentpress_tools") else None
            configured_mcps = json.dumps(tools["configured_mcps"]) if tools.get("configured_mcps") else None
            custom_mcps = json.dumps(tools["custom_mcps"]) if tools.get("custom_mcps") else None

        agent_row = await execute_one(
            """INSERT INTO agents (
                   agent_id, account_id, name, description, system_prompt, model, model_provider,
                   agentpress_tools, configured_mcps, custom_mcps, is_default,
                   icon_name, icon_color, icon_background, metadata
               )
               VALUES (
                   :agent_id, :account_id, :name, :description, :system_prompt, :model, :model_provider,
                   :agentpress_tools, :configured_mcps, :custom_mcps, false,
                   :icon_name, :icon_color, :icon_background, :metadata
               )
               RETURNING agent_id, name, created_at""",
            {
                "agent_id": new_agent_id,
                "account_id": user_id,
                "name": agent_name,
                "description": agent_info.get("description"),
                "system_prompt": system_prompt,
                "model": model,
                "model_provider": model_provider,
                "agentpress_tools": agentpress_tools,
                "configured_mcps": configured_mcps,
                "custom_mcps": custom_mcps,
                "icon_name": agent_info.get("icon_name"),
                "icon_color": agent_info.get("icon_color"),
                "icon_background": agent_info.get("icon_background"),
                "metadata": json.dumps(agent_info.get("metadata")) if agent_info.get("metadata") else None,
            },
            commit=True,
        )

        if not agent_row:
            raise HTTPException(status_code=500, detail="Failed to create agent from bundle")

        # Import triggers if present
        imported_triggers = 0
        for trigger in config_data.get("triggers", []):
            if not isinstance(trigger, dict) or not trigger.get("name") or not trigger.get("cron_expression"):
                continue
            try:
                await execute_one(
                    """INSERT INTO agent_schedules (user_id, agent_id, name, cron_expression, timezone, input_message, is_active, max_runs)
                       VALUES (:user_id, :agent_id, :name, :cron_expression, :timezone, :input_message, :is_active, :max_runs)""",
                    {
                        "user_id": user_id,
                        "agent_id": new_agent_id,
                        "name": trigger["name"],
                        "cron_expression": trigger["cron_expression"],
                        "timezone": trigger.get("timezone", "UTC"),
                        "input_message": trigger.get("input_message"),
                        "is_active": trigger.get("is_active", True),
                        "max_runs": trigger.get("max_runs"),
                    },
                    commit=True,
                )
                imported_triggers += 1
            except Exception as e:
                logger.warning(f"Could not import trigger '{trigger.get('name')}': {e}")

        return {
            "agent_id": new_agent_id,
            "name": agent_name,
            "created_at": agent_row["created_at"].isoformat() if hasattr(agent_row["created_at"], "isoformat") else str(agent_row["created_at"]),
            "imported": {
                "tools": bool(agentpress_tools or configured_mcps or custom_mcps),
                "triggers": imported_triggers,
                "env_var_keys_required": config_data.get("env_var_keys", []),
                "kb_refs_referenced": len(config_data.get("kb_refs", [])),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing agent from bundle: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import agent from bundle: {str(e)}")


@router.get("/bundles", summary="List user bundles")
async def list_bundles(
    agent_id: Optional[str] = Query(None),
    bundle_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List the authenticated user's agent bundles."""
    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id}

        if agent_id:
            where_clauses.append("agent_id::text = :agent_id")
            params["agent_id"] = agent_id

        if bundle_type and bundle_type != "all":
            where_clauses.append("bundle_type = :bundle_type")
            params["bundle_type"] = bundle_type

        where_sql = " AND ".join(where_clauses)
        params["limit"] = limit
        params["offset"] = offset

        rows = await execute(
            f"""SELECT id, user_id, agent_id, bundle_name, bundle_version, bundle_type,
                       included_sections, file_size_bytes, checksum, is_public,
                       download_count, created_at
                FROM agent_bundles
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        count_rows = await execute(
            f"SELECT COUNT(*) FROM agent_bundles WHERE {where_sql}",
            {k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
        total = count_rows[0]["count"] if count_rows else 0

        return {
            "bundles": [dict(r) for r in (rows or [])],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except Exception as e:
        logger.error(f"Error listing bundles: {e}")
        raise HTTPException(status_code=500, detail="Failed to list bundles")


@router.get("/bundles/public", summary="Browse public bundles")
async def list_public_bundles(
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Browse publicly shared agent bundles."""
    try:
        where_clauses = ["is_public = true"]
        params: Dict[str, Any] = {}

        if search:
            where_clauses.append("bundle_name ILIKE :search")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)
        params["limit"] = limit
        params["offset"] = offset

        rows = await execute(
            f"""SELECT id, user_id, agent_id, bundle_name, bundle_version, bundle_type,
                       included_sections, file_size_bytes, checksum, is_public,
                       download_count, created_at
                FROM agent_bundles
                WHERE {where_sql}
                ORDER BY download_count DESC, created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        count_rows = await execute(
            f"SELECT COUNT(*) FROM agent_bundles WHERE {where_sql}",
            {k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
        total = count_rows[0]["count"] if count_rows else 0

        return {
            "bundles": [dict(r) for r in (rows or [])],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except Exception as e:
        logger.error(f"Error listing public bundles: {e}")
        raise HTTPException(status_code=500, detail="Failed to list public bundles")


@router.get("/bundles/{bundle_id}", summary="Get bundle detail")
async def get_bundle_detail(
    bundle_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get details of a specific bundle."""
    try:
        row = await execute_one(
            """SELECT * FROM agent_bundles
               WHERE id = :bundle_id AND (user_id::text = :user_id OR is_public = true)""",
            {"bundle_id": bundle_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Bundle not found")

        result = dict(row)
        if isinstance(result.get("config_data"), str):
            result["config_data"] = json.loads(result["config_data"])
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting bundle {bundle_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get bundle")


@router.delete("/bundles/{bundle_id}", summary="Delete bundle")
async def delete_bundle(
    bundle_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a bundle owned by the user."""
    try:
        existing = await execute_one(
            "SELECT id FROM agent_bundles WHERE id = :bundle_id AND user_id::text = :user_id",
            {"bundle_id": bundle_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Bundle not found")

        await execute(
            "DELETE FROM agent_bundles WHERE id = :bundle_id AND user_id::text = :user_id",
            {"bundle_id": bundle_id, "user_id": user_id},
        )
        return {"status": "ok"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bundle {bundle_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete bundle")


@router.post("/bundles/{bundle_id}/download", summary="Download bundle data")
async def download_bundle(
    bundle_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment download count and return full bundle data."""
    try:
        row = await execute_one(
            """UPDATE agent_bundles
               SET download_count = download_count + 1
               WHERE id = :bundle_id AND (user_id::text = :user_id OR is_public = true)
               RETURNING *""",
            {"bundle_id": bundle_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Bundle not found")

        result = dict(row)
        if isinstance(result.get("config_data"), str):
            result["config_data"] = json.loads(result["config_data"])
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading bundle {bundle_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to download bundle")
