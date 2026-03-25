"""
Agent Clone API.

Clone agents with optional modifications, list clones from a source,
and compute field-by-field diffs between any two agents.
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["agent-clone"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CloneAgentRequest(BaseModel):
    """Body for POST /agents/{agent_id}/clone-with-mods."""
    name: Optional[str] = Field(None, description="Override the cloned agent name")
    instructions_override: Optional[str] = Field(None, description="Override system prompt")
    model_override: Optional[str] = Field(None, description="Override model")
    tool_overrides: Optional[Dict[str, Any]] = Field(None, description="Override agentpress_tools config")


class CloneHistoryItem(BaseModel):
    id: str
    source_agent_id: str
    cloned_agent_id: str
    cloned_agent_name: Optional[str] = None
    modifications: Dict[str, Any] = {}
    created_at: str


class AgentDiffField(BaseModel):
    field: str
    type: str  # 'same', 'modified', 'added', 'removed'
    value_a: Optional[Any] = None
    value_b: Optional[Any] = None


class AgentDiffResponse(BaseModel):
    agent_a_id: str
    agent_a_name: str
    agent_b_id: str
    agent_b_name: str
    differences: List[AgentDiffField]


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _parse_json_field(val: Any) -> Any:
    """Parse a JSON string field to a Python dict/list if needed."""
    if val is None:
        return None
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


async def _get_agent_config(agent_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch full agent config (agent row + active version config)."""
    agent_row = await execute_one(
        """SELECT agent_id, name, system_prompt, model, model_provider,
                  agentpress_tools, configured_mcps, custom_mcps, is_default,
                  avatar_url, metadata, icon_name, icon_color, icon_background
           FROM agents
           WHERE agent_id::text = :agent_id AND account_id::text = :user_id""",
        {"agent_id": agent_id, "user_id": user_id},
    )
    if not agent_row:
        return None

    # Try to get version config for richer data
    version_row = await execute_one(
        """SELECT system_prompt, model, configured_mcps, custom_mcps, agentpress_tools
           FROM agent_versions
           WHERE agent_id::text = :agent_id AND is_active = true
           ORDER BY created_at DESC LIMIT 1""",
        {"agent_id": agent_id},
    )

    system_prompt = None
    model = None
    agentpress_tools = None
    configured_mcps = None
    custom_mcps = None

    if version_row:
        system_prompt = version_row.get("system_prompt")
        model = version_row.get("model")
        agentpress_tools = _parse_json_field(version_row.get("agentpress_tools"))
        configured_mcps = _parse_json_field(version_row.get("configured_mcps"))
        custom_mcps = _parse_json_field(version_row.get("custom_mcps"))
    else:
        system_prompt = agent_row.get("system_prompt")
        model = agent_row.get("model")
        agentpress_tools = _parse_json_field(agent_row.get("agentpress_tools"))
        configured_mcps = _parse_json_field(agent_row.get("configured_mcps"))
        custom_mcps = _parse_json_field(agent_row.get("custom_mcps"))

    return {
        "agent_id": agent_row["agent_id"],
        "name": agent_row.get("name"),
        "system_prompt": system_prompt,
        "model": model,
        "model_provider": agent_row.get("model_provider"),
        "agentpress_tools": agentpress_tools,
        "configured_mcps": configured_mcps,
        "custom_mcps": custom_mcps,
        "is_default": agent_row.get("is_default", False),
        "icon_name": agent_row.get("icon_name"),
        "icon_color": agent_row.get("icon_color"),
        "icon_background": agent_row.get("icon_background"),
        "metadata": _parse_json_field(agent_row.get("metadata")),
    }


def _diff_field(field: str, val_a: Any, val_b: Any) -> AgentDiffField:
    """Compare two values for a named field."""
    # Normalize None vs empty
    norm_a = val_a if val_a is not None else None
    norm_b = val_b if val_b is not None else None

    if norm_a == norm_b:
        return AgentDiffField(field=field, type="same", value_a=norm_a, value_b=norm_b)

    if norm_a is None and norm_b is not None:
        return AgentDiffField(field=field, type="added", value_a=None, value_b=norm_b)

    if norm_a is not None and norm_b is None:
        return AgentDiffField(field=field, type="removed", value_a=norm_a, value_b=None)

    return AgentDiffField(field=field, type="modified", value_a=norm_a, value_b=norm_b)


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/agents/{agent_id}/clone-with-mods", summary="Clone agent with modifications")
async def clone_agent_with_mods(
    agent_id: str,
    body: CloneAgentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Clone an agent with optional modifications to name, instructions, model, and tools.
    Records the clone operation in agent_clone_history.
    """
    from core.agents import repo as agents_repo

    logger.debug(f"Clone-with-mods agent {agent_id} for user {user_id}")

    # Check agent count limit
    from core.utils.limits_checker import check_agent_count_limit
    limit_check = await check_agent_count_limit(user_id)
    if not limit_check["can_create"]:
        raise HTTPException(
            status_code=402,
            detail={
                "message": f"Maximum of {limit_check['limit']} agents allowed for your current plan.",
                "current_count": limit_check["current_count"],
                "limit": limit_check["limit"],
                "tier_name": limit_check["tier_name"],
                "error_code": "AGENT_LIMIT_EXCEEDED",
            },
        )

    try:
        # Get source agent config
        source_config = await _get_agent_config(agent_id, user_id)
        if not source_config:
            raise HTTPException(status_code=404, detail="Source agent not found")

        # Determine clone values with overrides
        clone_name = body.name or f"Copy of {source_config['name']}"
        clone_instructions = body.instructions_override if body.instructions_override is not None else source_config.get("system_prompt", "")
        clone_model = body.model_override if body.model_override is not None else source_config.get("model")
        clone_tools = body.tool_overrides if body.tool_overrides is not None else source_config.get("agentpress_tools", {})

        # Track what was modified
        modifications: Dict[str, Any] = {}
        if body.name is not None:
            modifications["name"] = body.name
        if body.instructions_override is not None:
            modifications["instructions"] = True
        if body.model_override is not None:
            modifications["model"] = body.model_override
        if body.tool_overrides is not None:
            modifications["tools"] = True

        # Create agent
        new_agent = await agents_repo.create_agent(
            account_id=user_id,
            name=clone_name,
            description=source_config.get("description"),
            icon_name=source_config.get("icon_name", "bot"),
            icon_color=source_config.get("icon_color", "#000000"),
            icon_background=source_config.get("icon_background", "#F3F4F6"),
            is_default=False,
        )

        if not new_agent:
            raise HTTPException(status_code=500, detail="Failed to create cloned agent")

        # Create initial version with (possibly overridden) config
        try:
            from core.agents.agent_crud import _get_version_service, ensure_core_tools_enabled

            version_service = await _get_version_service()

            agentpress_tools = clone_tools or {}
            agentpress_tools = ensure_core_tools_enabled(agentpress_tools)

            configured_mcps = source_config.get("configured_mcps") or []
            custom_mcps = source_config.get("custom_mcps") or []

            version = await version_service.create_version(
                agent_id=new_agent["agent_id"],
                user_id=user_id,
                system_prompt=clone_instructions or "",
                model=clone_model,
                configured_mcps=configured_mcps,
                custom_mcps=custom_mcps,
                agentpress_tools=agentpress_tools,
                version_name="v1",
                change_description=f"Cloned from {source_config['name']}",
            )

            new_agent["current_version_id"] = version.version_id
            new_agent["version_count"] = 1
        except Exception as e:
            logger.error(f"Error creating version for cloned agent: {e}")
            await agents_repo.delete_agent(new_agent["agent_id"], user_id)
            raise HTTPException(status_code=500, detail="Failed to create cloned agent version")

        # Record clone history
        try:
            await execute_one(
                """INSERT INTO agent_clone_history (user_id, source_agent_id, cloned_agent_id, modifications)
                   VALUES (:user_id, :source_agent_id, :cloned_agent_id, :modifications)
                   RETURNING id""",
                {
                    "user_id": user_id,
                    "source_agent_id": agent_id,
                    "cloned_agent_id": new_agent["agent_id"],
                    "modifications": json.dumps(modifications),
                },
                commit=True,
            )
        except Exception as e:
            logger.warning(f"Failed to record clone history: {e}")

        # Invalidate caches
        from core.utils.cache import Cache
        await Cache.invalidate(f"agent_count_limit:{user_id}")

        # Load full agent data
        from .agent_loader import get_agent_loader
        loader = await get_agent_loader()
        agent_data = await loader.load_agent(new_agent["agent_id"], user_id, load_config=True)

        # Emit webhook
        try:
            import asyncio
            from core.webhooks.webhook_service import webhook_service
            asyncio.create_task(
                webhook_service.send(user_id, "agent.cloned", {
                    "agent_id": new_agent["agent_id"],
                    "source_agent_id": agent_id,
                    "name": clone_name,
                    "modifications": modifications,
                })
            )
        except Exception as wh_err:
            logger.warning(f"Webhook emission failed for agent.cloned: {wh_err}")

        logger.debug(f"Cloned agent {agent_id} -> {new_agent['agent_id']} with mods for user: {user_id}")

        return {
            "agent_id": new_agent["agent_id"],
            "name": clone_name,
            "source_agent_id": agent_id,
            "modifications": modifications,
            "created_at": _ts(new_agent.get("created_at")),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cloning agent {agent_id} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone agent: {str(e)}")


@router.get("/agents/{agent_id}/clones", summary="List clones of an agent")
async def list_agent_clones(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all agents cloned from this source agent."""
    try:
        rows = await execute(
            """SELECT ch.id, ch.source_agent_id, ch.cloned_agent_id, ch.modifications, ch.created_at,
                      a.name as cloned_agent_name
               FROM agent_clone_history ch
               LEFT JOIN agents a ON a.agent_id::text = ch.cloned_agent_id::text
               WHERE ch.source_agent_id::text = :agent_id AND ch.user_id::text = :user_id
               ORDER BY ch.created_at DESC
               LIMIT :limit OFFSET :offset""",
            {"agent_id": agent_id, "user_id": user_id, "limit": limit, "offset": offset},
        )

        clones = []
        for row in (rows or []):
            mods = row.get("modifications") or {}
            if isinstance(mods, str):
                try:
                    mods = json.loads(mods)
                except (json.JSONDecodeError, TypeError):
                    mods = {}

            clones.append({
                "id": str(row["id"]),
                "source_agent_id": row["source_agent_id"],
                "cloned_agent_id": row["cloned_agent_id"],
                "cloned_agent_name": row.get("cloned_agent_name"),
                "modifications": mods,
                "created_at": _ts(row.get("created_at")),
            })

        return {"clones": clones, "total": len(clones)}

    except Exception as e:
        logger.error(f"Error listing clones for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list agent clones")


@router.get("/agents/clone-diff", summary="Diff two agents")
async def diff_agents(
    agent_a: str = Query(..., description="First agent ID"),
    agent_b: str = Query(..., description="Second agent ID"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Compare two agents field-by-field.
    Returns differences in name, instructions, model, tools, MCPs, and icon config.
    """
    try:
        config_a = await _get_agent_config(agent_a, user_id)
        if not config_a:
            raise HTTPException(status_code=404, detail=f"Agent {agent_a} not found")

        config_b = await _get_agent_config(agent_b, user_id)
        if not config_b:
            raise HTTPException(status_code=404, detail=f"Agent {agent_b} not found")

        # Compare fields
        fields_to_compare = [
            ("name", config_a.get("name"), config_b.get("name")),
            ("instructions", config_a.get("system_prompt"), config_b.get("system_prompt")),
            ("model", config_a.get("model"), config_b.get("model")),
            ("model_provider", config_a.get("model_provider"), config_b.get("model_provider")),
            ("agentpress_tools", config_a.get("agentpress_tools"), config_b.get("agentpress_tools")),
            ("configured_mcps", config_a.get("configured_mcps"), config_b.get("configured_mcps")),
            ("custom_mcps", config_a.get("custom_mcps"), config_b.get("custom_mcps")),
            ("icon_name", config_a.get("icon_name"), config_b.get("icon_name")),
            ("icon_color", config_a.get("icon_color"), config_b.get("icon_color")),
            ("icon_background", config_a.get("icon_background"), config_b.get("icon_background")),
        ]

        differences = []
        for field_name, val_a, val_b in fields_to_compare:
            diff = _diff_field(field_name, val_a, val_b)
            differences.append(diff.model_dump())

        return {
            "agent_a_id": agent_a,
            "agent_a_name": config_a.get("name", "Unknown"),
            "agent_b_id": agent_b,
            "agent_b_name": config_b.get("name", "Unknown"),
            "differences": differences,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error diffing agents {agent_a} vs {agent_b}: {e}")
        raise HTTPException(status_code=500, detail="Failed to diff agents")
