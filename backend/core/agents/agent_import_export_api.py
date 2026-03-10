"""
Agent Import/Export API.

Export full agent configuration as JSON and import agents from JSON configs.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["agent-import-export"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AgentExportConfig(BaseModel):
    """Full agent configuration for export."""
    export_version: str = "1.0"
    exported_at: str
    agent: Dict[str, Any]
    tools: Dict[str, Any] = {}
    knowledge_entries: List[Dict[str, Any]] = []
    secret_keys: List[str] = []
    schedules: List[Dict[str, Any]] = []
    quota_config: Optional[Dict[str, Any]] = None


class AgentImportRequest(BaseModel):
    """Request body for importing an agent from JSON config."""
    config: Dict[str, Any] = Field(..., description="Agent export JSON config")
    name_override: Optional[str] = Field(None, description="Override agent name on import")


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> Optional[str]:
    """Convert a datetime or string to ISO string."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


async def _build_export_config(
    agent_id: str,
    user_id: str,
    include_knowledge: bool = True,
    include_schedules: bool = True,
    include_quota: bool = True,
) -> Dict[str, Any]:
    """Build the full export config for an agent."""

    # Get agent data
    agent_row = await execute_one(
        """SELECT agent_id, name, system_prompt, model, model_provider,
                  agentpress_tools, configured_mcps, custom_mcps, is_default,
                  avatar_url, metadata, icon_name, icon_color, icon_background
           FROM agents
           WHERE agent_id = :agent_id AND account_id = :user_id""",
        {"agent_id": agent_id, "user_id": user_id},
    )

    if not agent_row:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_data = {
        "name": agent_row["name"],
        "system_prompt": agent_row.get("system_prompt"),
        "model": agent_row.get("model"),
        "model_provider": agent_row.get("model_provider"),
        "is_default": agent_row.get("is_default", False),
        "icon_name": agent_row.get("icon_name"),
        "icon_color": agent_row.get("icon_color"),
        "icon_background": agent_row.get("icon_background"),
        "metadata": agent_row.get("metadata"),
    }

    # Tools config
    tools_config = {}
    if agent_row.get("agentpress_tools"):
        tools_config["agentpress_tools"] = agent_row["agentpress_tools"]
    if agent_row.get("configured_mcps"):
        tools_config["configured_mcps"] = agent_row["configured_mcps"]
    if agent_row.get("custom_mcps"):
        tools_config["custom_mcps"] = agent_row["custom_mcps"]

    # Knowledge entries (names and content summaries only, not full files)
    knowledge_entries = []
    if include_knowledge:
        try:
            kb_rows = await execute(
                """SELECT id, title, content_type, file_name, description
                   FROM knowledge_base_items
                   WHERE agent_id = :agent_id AND user_id = :user_id
                   ORDER BY created_at""",
                {"agent_id": agent_id, "user_id": user_id},
            )
            knowledge_entries = [
                {
                    "title": r.get("title") or r.get("file_name", "Untitled"),
                    "content_type": r.get("content_type"),
                    "description": r.get("description"),
                }
                for r in (kb_rows or [])
            ]
        except Exception as e:
            logger.debug(f"Could not fetch knowledge entries for export: {e}")

    # Secret keys only (no values)
    secret_keys = []
    try:
        secret_rows = await execute(
            "SELECT key FROM agent_secrets WHERE agent_id = :agent_id AND user_id = :user_id ORDER BY key",
            {"agent_id": agent_id, "user_id": user_id},
        )
        secret_keys = [r["key"] for r in (secret_rows or [])]
    except Exception as e:
        logger.debug(f"Could not fetch secrets for export: {e}")

    # Schedules
    schedules = []
    if include_schedules:
        try:
            sched_rows = await execute(
                """SELECT name, cron_expression, timezone, input_message, is_active, max_runs
                   FROM agent_schedules
                   WHERE agent_id = :agent_id AND user_id = :user_id
                   ORDER BY created_at""",
                {"agent_id": agent_id, "user_id": user_id},
            )
            schedules = [
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
            logger.debug(f"Could not fetch schedules for export: {e}")

    # Quota config
    quota_config = None
    if include_quota:
        try:
            quota_row = await execute_one(
                """SELECT max_runs_per_day, max_tokens_per_day, max_cost_per_day,
                          max_runs_per_month, max_tokens_per_month, max_cost_per_month,
                          alert_threshold_pct, is_enforced
                   FROM agent_quotas
                   WHERE agent_id = :agent_id AND user_id = :user_id""",
                {"agent_id": agent_id, "user_id": user_id},
            )
            if quota_row:
                quota_config = {
                    "max_runs_per_day": quota_row.get("max_runs_per_day"),
                    "max_tokens_per_day": quota_row.get("max_tokens_per_day"),
                    "max_cost_per_day": float(quota_row["max_cost_per_day"]) if quota_row.get("max_cost_per_day") else None,
                    "max_runs_per_month": quota_row.get("max_runs_per_month"),
                    "max_tokens_per_month": quota_row.get("max_tokens_per_month"),
                    "max_cost_per_month": float(quota_row["max_cost_per_month"]) if quota_row.get("max_cost_per_month") else None,
                    "alert_threshold_pct": quota_row.get("alert_threshold_pct"),
                    "is_enforced": quota_row.get("is_enforced"),
                }
        except Exception as e:
            logger.debug(f"Could not fetch quota for export: {e}")

    return {
        "export_version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "agent": agent_data,
        "tools": tools_config,
        "knowledge_entries": knowledge_entries,
        "secret_keys": secret_keys,
        "schedules": schedules,
        "quota_config": quota_config,
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/agents/{agent_id}/export", summary="Export agent config")
async def export_agent(
    agent_id: str,
    include_knowledge: bool = Query(True, description="Include knowledge entry names"),
    include_schedules: bool = Query(True, description="Include schedule configs"),
    include_quota: bool = Query(True, description="Include quota config"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export full agent configuration as JSON."""
    try:
        config = await _build_export_config(
            agent_id,
            user_id,
            include_knowledge=include_knowledge,
            include_schedules=include_schedules,
            include_quota=include_quota,
        )
        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export agent")


@router.post("/agents/{agent_id}/export/download", summary="Download agent config as file")
async def download_agent_export(
    agent_id: str,
    include_knowledge: bool = Query(True),
    include_schedules: bool = Query(True),
    include_quota: bool = Query(True),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export agent config as a downloadable JSON file."""
    try:
        config = await _build_export_config(
            agent_id,
            user_id,
            include_knowledge=include_knowledge,
            include_schedules=include_schedules,
            include_quota=include_quota,
        )

        agent_name = config["agent"]["name"]
        safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in agent_name).strip().replace(" ", "-").lower()
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = f"agent-{safe_name}-{date_str}.json"

        content = json.dumps(config, indent=2, default=str)

        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading agent export {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to download agent export")


@router.post("/agents/import", summary="Import agent from config")
async def import_agent(
    body: AgentImportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Import an agent from a previously exported JSON configuration."""
    try:
        config = body.config

        # Validate config structure
        agent_data = config.get("agent")
        if not agent_data or not isinstance(agent_data, dict):
            raise HTTPException(
                status_code=400,
                detail="Invalid config: missing 'agent' object",
            )

        agent_name = body.name_override or agent_data.get("name")
        if not agent_name:
            raise HTTPException(
                status_code=400,
                detail="Agent name is required (either in config or via name_override)",
            )

        # Extract tools
        tools_config = config.get("tools", {})
        agentpress_tools = tools_config.get("agentpress_tools")
        configured_mcps = tools_config.get("configured_mcps")
        custom_mcps = tools_config.get("custom_mcps")

        # Create the agent
        import uuid
        new_agent_id = str(uuid.uuid4())

        agent_row = await execute_one(
            """INSERT INTO agents (
                   agent_id, account_id, name, system_prompt, model, model_provider,
                   agentpress_tools, configured_mcps, custom_mcps, is_default,
                   icon_name, icon_color, icon_background, metadata
               )
               VALUES (
                   :agent_id, :account_id, :name, :system_prompt, :model, :model_provider,
                   :agentpress_tools, :configured_mcps, :custom_mcps, false,
                   :icon_name, :icon_color, :icon_background, :metadata
               )
               RETURNING agent_id, name, created_at""",
            {
                "agent_id": new_agent_id,
                "account_id": user_id,
                "name": agent_name,
                "system_prompt": agent_data.get("system_prompt"),
                "model": agent_data.get("model"),
                "model_provider": agent_data.get("model_provider"),
                "agentpress_tools": json.dumps(agentpress_tools) if agentpress_tools else None,
                "configured_mcps": json.dumps(configured_mcps) if configured_mcps else None,
                "custom_mcps": json.dumps(custom_mcps) if custom_mcps else None,
                "icon_name": agent_data.get("icon_name"),
                "icon_color": agent_data.get("icon_color"),
                "icon_background": agent_data.get("icon_background"),
                "metadata": json.dumps(agent_data.get("metadata")) if agent_data.get("metadata") else None,
            },
            commit=True,
        )

        if not agent_row:
            raise HTTPException(status_code=500, detail="Failed to create agent from import")

        # Import quota config if present
        quota_config = config.get("quota_config")
        if quota_config and isinstance(quota_config, dict):
            try:
                await execute_one(
                    """INSERT INTO agent_quotas (user_id, agent_id, max_runs_per_day, max_tokens_per_day, max_cost_per_day,
                           max_runs_per_month, max_tokens_per_month, max_cost_per_month, alert_threshold_pct, is_enforced)
                       VALUES (:user_id, :agent_id, :max_runs_per_day, :max_tokens_per_day, :max_cost_per_day,
                           :max_runs_per_month, :max_tokens_per_month, :max_cost_per_month, :alert_threshold_pct, :is_enforced)
                       ON CONFLICT (user_id, agent_id) DO UPDATE SET
                           max_runs_per_day = EXCLUDED.max_runs_per_day,
                           max_tokens_per_day = EXCLUDED.max_tokens_per_day,
                           max_cost_per_day = EXCLUDED.max_cost_per_day,
                           max_runs_per_month = EXCLUDED.max_runs_per_month,
                           max_tokens_per_month = EXCLUDED.max_tokens_per_month,
                           max_cost_per_month = EXCLUDED.max_cost_per_month,
                           alert_threshold_pct = EXCLUDED.alert_threshold_pct,
                           is_enforced = EXCLUDED.is_enforced""",
                    {
                        "agent_id": new_agent_id,
                        "user_id": user_id,
                        "max_runs_per_day": quota_config.get("max_runs_per_day"),
                        "max_tokens_per_day": quota_config.get("max_tokens_per_day"),
                        "max_cost_per_day": quota_config.get("max_cost_per_day"),
                        "max_runs_per_month": quota_config.get("max_runs_per_month"),
                        "max_tokens_per_month": quota_config.get("max_tokens_per_month"),
                        "max_cost_per_month": quota_config.get("max_cost_per_month"),
                        "alert_threshold_pct": quota_config.get("alert_threshold_pct", 80),
                        "is_enforced": quota_config.get("is_enforced", False),
                    },
                    commit=True,
                )
            except Exception as e:
                logger.warning(f"Could not import quota config: {e}")

        # Import schedules if present
        schedules = config.get("schedules", [])
        imported_schedules = 0
        for sched in schedules:
            if not isinstance(sched, dict) or not sched.get("name") or not sched.get("cron_expression"):
                continue
            try:
                await execute_one(
                    """INSERT INTO agent_schedules (user_id, agent_id, name, cron_expression, timezone, input_message, is_active, max_runs)
                       VALUES (:user_id, :agent_id, :name, :cron_expression, :timezone, :input_message, :is_active, :max_runs)""",
                    {
                        "user_id": user_id,
                        "agent_id": new_agent_id,
                        "name": sched["name"],
                        "cron_expression": sched["cron_expression"],
                        "timezone": sched.get("timezone", "UTC"),
                        "input_message": sched.get("input_message"),
                        "is_active": sched.get("is_active", True),
                        "max_runs": sched.get("max_runs"),
                    },
                    commit=True,
                )
                imported_schedules += 1
            except Exception as e:
                logger.warning(f"Could not import schedule '{sched.get('name')}': {e}")

        # Build summary of what was imported
        secret_keys = config.get("secret_keys", [])
        knowledge_entries = config.get("knowledge_entries", [])

        return {
            "agent_id": new_agent_id,
            "name": agent_name,
            "created_at": _ts(agent_row["created_at"]),
            "imported": {
                "tools": bool(agentpress_tools or configured_mcps or custom_mcps),
                "schedules": imported_schedules,
                "quota": bool(quota_config),
                "secret_keys_required": secret_keys,
                "knowledge_entries_referenced": len(knowledge_entries),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing agent: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import agent: {str(e)}")
