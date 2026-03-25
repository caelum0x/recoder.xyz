"""
Agent Clone Wizard API.

Provides multi-step clone wizard operations:
- Preview what sections can be cloned from an agent
- Execute a clone with section-level selection
- List clone history
- Suggest name and configuration tweaks for cloned agents
"""

import json
import sys
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-clone-wizard"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SectionPreview(BaseModel):
    section: str
    item_count: int = 0
    size_estimate: str = "0 B"
    available: bool = True
    preview: Optional[Any] = None


class ClonePreviewResponse(BaseModel):
    agent_id: str
    agent_name: str
    sections: List[SectionPreview]


class CloneAgentWizardRequest(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=200, description="Name for the cloned agent")
    sections: List[str] = Field(default_factory=list, description="Sections to include in clone")
    overrides: Optional[Dict[str, Any]] = Field(None, description="Optional JSONB overrides per section")


class CloneHistoryWizardItem(BaseModel):
    id: str
    source_agent_id: str
    target_agent_id: Optional[str] = None
    source_agent_name: Optional[str] = None
    target_agent_name: Optional[str] = None
    cloned_sections: List[str] = Field(default_factory=list)
    clone_options: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class CloneSuggestion(BaseModel):
    suggested_name: str
    suggested_tweaks: List[str] = Field(default_factory=list)


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _parse_json(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


def _estimate_size(data: Any) -> str:
    """Estimate the JSON size of a value in a human-readable format."""
    if data is None:
        return "0 B"
    try:
        size_bytes = sys.getsizeof(json.dumps(data) if not isinstance(data, str) else data)
    except Exception:
        size_bytes = 0
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


async def _get_full_agent_config(agent_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the full agent config (agent row + active version config)."""
    agent_row = await execute_one(
        """SELECT agent_id, name, description, system_prompt, model, model_provider,
                  agentpress_tools, configured_mcps, custom_mcps, is_default,
                  avatar_url, metadata, icon_name, icon_color, icon_background
           FROM agents
           WHERE agent_id::text = :agent_id AND account_id::text = :user_id""",
        {"agent_id": agent_id, "user_id": user_id},
    )
    if not agent_row:
        return None

    # Try active version for richer data
    version_row = await execute_one(
        """SELECT system_prompt, model, configured_mcps, custom_mcps, agentpress_tools
           FROM agent_versions
           WHERE agent_id::text = :agent_id AND is_active = true
           ORDER BY created_at DESC LIMIT 1""",
        {"agent_id": agent_id},
    )

    if version_row:
        system_prompt = version_row.get("system_prompt")
        model = version_row.get("model")
        agentpress_tools = _parse_json(version_row.get("agentpress_tools"))
        configured_mcps = _parse_json(version_row.get("configured_mcps"))
        custom_mcps = _parse_json(version_row.get("custom_mcps"))
    else:
        system_prompt = agent_row.get("system_prompt")
        model = agent_row.get("model")
        agentpress_tools = _parse_json(agent_row.get("agentpress_tools"))
        configured_mcps = _parse_json(agent_row.get("configured_mcps"))
        custom_mcps = _parse_json(agent_row.get("custom_mcps"))

    # Fetch workflows
    workflows = []
    try:
        workflow_rows = await execute(
            """SELECT workflow_id, name FROM agent_workflows
               WHERE agent_id::text = :agent_id ORDER BY created_at""",
            {"agent_id": agent_id},
        )
        workflows = workflow_rows or []
    except Exception:
        pass

    # Fetch tags
    tags = []
    try:
        tag_rows = await execute(
            """SELECT tag FROM agent_tags WHERE agent_id::text = :agent_id""",
            {"agent_id": agent_id},
        )
        tags = [r["tag"] for r in (tag_rows or [])]
    except Exception:
        pass

    return {
        "agent_id": agent_row["agent_id"],
        "name": agent_row.get("name"),
        "description": agent_row.get("description"),
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
        "metadata": _parse_json(agent_row.get("metadata")),
        "workflows": workflows,
        "tags": tags,
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/clone-preview",
    summary="Preview Clone Sections",
    operation_id="clone_preview",
)
async def clone_preview(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Preview what will be cloned from an agent.
    Returns available sections with item counts and size estimates.
    """
    try:
        config = await _get_full_agent_config(agent_id, user_id)
        if not config:
            raise HTTPException(status_code=404, detail="Agent not found")

        sections: List[Dict[str, Any]] = []

        # Instructions
        prompt = config.get("system_prompt") or ""
        sections.append({
            "section": "instructions",
            "item_count": 1 if prompt else 0,
            "size_estimate": _estimate_size(prompt),
            "available": bool(prompt),
            "preview": (prompt[:200] + "...") if len(prompt) > 200 else prompt if prompt else None,
        })

        # Tools
        tools = config.get("agentpress_tools") or {}
        tool_count = len(tools) if isinstance(tools, dict) else 0
        sections.append({
            "section": "tools",
            "item_count": tool_count,
            "size_estimate": _estimate_size(tools),
            "available": tool_count > 0,
            "preview": list(tools.keys())[:10] if isinstance(tools, dict) else None,
        })

        # Workflows
        workflows = config.get("workflows") or []
        sections.append({
            "section": "workflows",
            "item_count": len(workflows),
            "size_estimate": _estimate_size(workflows),
            "available": len(workflows) > 0,
            "preview": [w.get("name") for w in workflows][:5] if workflows else None,
        })

        # Routing rules (configured_mcps + custom_mcps)
        configured_mcps = config.get("configured_mcps") or []
        custom_mcps = config.get("custom_mcps") or []
        routing_count = len(configured_mcps) + len(custom_mcps)
        sections.append({
            "section": "routing_rules",
            "item_count": routing_count,
            "size_estimate": _estimate_size({"configured": configured_mcps, "custom": custom_mcps}),
            "available": routing_count > 0,
            "preview": None,
        })

        # Tags
        tags = config.get("tags") or []
        sections.append({
            "section": "tags",
            "item_count": len(tags),
            "size_estimate": _estimate_size(tags),
            "available": len(tags) > 0,
            "preview": tags[:10] if tags else None,
        })

        # Deployment config (model, model_provider, icon, metadata)
        deploy_config = {
            "model": config.get("model"),
            "model_provider": config.get("model_provider"),
            "icon_name": config.get("icon_name"),
            "icon_color": config.get("icon_color"),
            "icon_background": config.get("icon_background"),
        }
        deploy_count = sum(1 for v in deploy_config.values() if v is not None)
        sections.append({
            "section": "deployment_config",
            "item_count": deploy_count,
            "size_estimate": _estimate_size(deploy_config),
            "available": deploy_count > 0,
            "preview": {k: v for k, v in deploy_config.items() if v is not None},
        })

        return {
            "agent_id": agent_id,
            "agent_name": config.get("name", "Unknown"),
            "sections": sections,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating clone preview for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate clone preview")


@router.post(
    "/agents/{agent_id}/clone",
    summary="Clone Agent (Wizard)",
    operation_id="clone_agent_wizard",
)
async def clone_agent_wizard(
    agent_id: str,
    body: CloneAgentWizardRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Execute a wizard-style clone: creates a new agent from selected sections of the source.
    Records the operation in agent_clone_history with section-level tracking.
    """
    from core.agents import repo as agents_repo

    logger.debug(f"Clone wizard: agent {agent_id} for user {user_id}, sections={body.sections}")

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
        source_config = await _get_full_agent_config(agent_id, user_id)
        if not source_config:
            raise HTTPException(status_code=404, detail="Source agent not found")

        selected = set(body.sections) if body.sections else {
            "instructions", "tools", "workflows", "routing_rules", "tags", "deployment_config"
        }
        overrides = body.overrides or {}

        # Determine values based on selected sections
        clone_instructions = ""
        clone_model = None
        clone_tools = {}
        configured_mcps = []
        custom_mcps = []
        clone_icon_name = "bot"
        clone_icon_color = "#000000"
        clone_icon_bg = "#F3F4F6"

        if "instructions" in selected:
            clone_instructions = overrides.get("instructions", source_config.get("system_prompt", ""))

        if "tools" in selected:
            clone_tools = overrides.get("tools", source_config.get("agentpress_tools", {}))

        if "routing_rules" in selected:
            configured_mcps = source_config.get("configured_mcps") or []
            custom_mcps = source_config.get("custom_mcps") or []

        if "deployment_config" in selected:
            clone_model = overrides.get("model", source_config.get("model"))
            clone_icon_name = source_config.get("icon_name", "bot")
            clone_icon_color = source_config.get("icon_color", "#000000")
            clone_icon_bg = source_config.get("icon_background", "#F3F4F6")

        # Create the new agent
        new_agent = await agents_repo.create_agent(
            account_id=user_id,
            name=body.new_name,
            description=overrides.get("description", source_config.get("description")),
            icon_name=clone_icon_name,
            icon_color=clone_icon_color,
            icon_background=clone_icon_bg,
            is_default=False,
        )

        if not new_agent:
            raise HTTPException(status_code=500, detail="Failed to create cloned agent")

        # Create initial version
        try:
            from core.agents.agent_crud import _get_version_service, ensure_core_tools_enabled

            version_service = await _get_version_service()
            agentpress_tools = clone_tools or {}
            agentpress_tools = ensure_core_tools_enabled(agentpress_tools)

            version = await version_service.create_version(
                agent_id=new_agent["agent_id"],
                user_id=user_id,
                system_prompt=clone_instructions or "",
                model=clone_model,
                configured_mcps=configured_mcps,
                custom_mcps=custom_mcps,
                agentpress_tools=agentpress_tools,
                version_name="v1",
                change_description=f"Cloned from {source_config['name']} (wizard)",
            )

            new_agent["current_version_id"] = version.version_id
        except Exception as e:
            logger.error(f"Error creating version for cloned agent: {e}")
            await agents_repo.delete_agent(new_agent["agent_id"], user_id)
            raise HTTPException(status_code=500, detail="Failed to create cloned agent version")

        # Clone tags if selected
        if "tags" in selected:
            source_tags = source_config.get("tags") or []
            for tag in source_tags:
                try:
                    await execute_mutate(
                        """INSERT INTO agent_tags (agent_id, tag, user_id)
                           VALUES (:agent_id, :tag, :user_id)
                           ON CONFLICT DO NOTHING""",
                        {"agent_id": new_agent["agent_id"], "tag": tag, "user_id": user_id},
                    )
                except Exception as tag_err:
                    logger.warning(f"Failed to clone tag '{tag}': {tag_err}")

        # Record clone history with wizard metadata
        try:
            await execute_mutate(
                """INSERT INTO agent_clone_history
                       (user_id, source_agent_id, cloned_agent_id, target_agent_id,
                        modifications, clone_options, cloned_sections)
                   VALUES (:user_id, :source_agent_id, :target_agent_id, :target_agent_id,
                           :modifications, :clone_options, :cloned_sections)""",
                {
                    "user_id": user_id,
                    "source_agent_id": agent_id,
                    "target_agent_id": new_agent["agent_id"],
                    "modifications": json.dumps({"wizard": True, "sections": list(selected)}),
                    "clone_options": json.dumps(overrides),
                    "cloned_sections": list(selected),
                },
            )
        except Exception as hist_err:
            logger.warning(f"Failed to record clone history: {hist_err}")

        # Invalidate caches
        try:
            from core.utils.cache import Cache
            await Cache.invalidate(f"agent_count_limit:{user_id}")
        except Exception:
            pass

        # Load full agent data
        try:
            from .agent_loader import get_agent_loader
            loader = await get_agent_loader()
            agent_data = await loader.load_agent(new_agent["agent_id"], user_id, load_config=True)
        except Exception:
            agent_data = new_agent

        logger.debug(f"Clone wizard: {agent_id} -> {new_agent['agent_id']} for user {user_id}")

        return {
            "agent_id": new_agent["agent_id"],
            "name": body.new_name,
            "source_agent_id": agent_id,
            "cloned_sections": list(selected),
            "created_at": _ts(new_agent.get("created_at")),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in clone wizard for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone agent: {str(e)}")


@router.get(
    "/agents/clone-history",
    summary="List Clone History",
    operation_id="list_clone_history_wizard",
)
async def list_clone_history(
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List the user's clone history (most recent first)."""
    try:
        rows = await execute(
            """SELECT ch.id, ch.source_agent_id,
                      COALESCE(ch.target_agent_id, ch.cloned_agent_id) AS target_agent_id,
                      ch.clone_options, ch.cloned_sections, ch.created_at,
                      sa.name AS source_agent_name,
                      ta.name AS target_agent_name
               FROM agent_clone_history ch
               LEFT JOIN agents sa ON sa.agent_id::text = ch.source_agent_id::text
               LEFT JOIN agents ta ON ta.agent_id::text = COALESCE(ch.target_agent_id, ch.cloned_agent_id)::text
               WHERE ch.user_id::text = :user_id
               ORDER BY ch.created_at DESC
               LIMIT :limit""",
            {"user_id": user_id, "limit": limit},
        )

        history = []
        for row in (rows or []):
            sections = row.get("cloned_sections")
            if sections is None:
                sections = []
            elif isinstance(sections, str):
                try:
                    sections = json.loads(sections)
                except Exception:
                    sections = []

            opts = row.get("clone_options") or {}
            if isinstance(opts, str):
                try:
                    opts = json.loads(opts)
                except Exception:
                    opts = {}

            history.append({
                "id": str(row["id"]),
                "source_agent_id": row["source_agent_id"],
                "target_agent_id": row.get("target_agent_id"),
                "source_agent_name": row.get("source_agent_name"),
                "target_agent_name": row.get("target_agent_name"),
                "cloned_sections": sections,
                "clone_options": opts,
                "created_at": _ts(row.get("created_at")),
            })

        return {"history": history, "total": len(history)}

    except Exception as e:
        logger.error(f"Error listing clone history for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list clone history")


@router.get(
    "/agents/{agent_id}/clone-suggestions",
    summary="Clone Name and Config Suggestions",
    operation_id="clone_suggestions",
)
async def clone_suggestions(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Suggest a name and configuration tweaks based on the source agent.
    """
    try:
        config = await _get_full_agent_config(agent_id, user_id)
        if not config:
            raise HTTPException(status_code=404, detail="Agent not found")

        source_name = config.get("name", "Agent")

        # Count existing clones to make name unique
        clone_count_row = await execute_one(
            """SELECT COUNT(*) AS cnt FROM agent_clone_history
               WHERE source_agent_id::text = :agent_id AND user_id::text = :user_id""",
            {"agent_id": agent_id, "user_id": user_id},
        )
        clone_count = (clone_count_row or {}).get("cnt", 0)
        suffix = f" (Copy {clone_count + 1})" if clone_count > 0 else " (Copy)"
        suggested_name = f"{source_name}{suffix}"

        # Generate tweaks
        tweaks: List[str] = []

        prompt = config.get("system_prompt") or ""
        if len(prompt) > 2000:
            tweaks.append("Consider shortening the instructions for the clone (currently over 2000 characters)")

        tools = config.get("agentpress_tools") or {}
        if isinstance(tools, dict) and len(tools) > 10:
            tweaks.append(f"The source has {len(tools)} tools configured. Consider enabling only the ones needed.")

        mcps = (config.get("configured_mcps") or []) + (config.get("custom_mcps") or [])
        if len(mcps) > 5:
            tweaks.append(f"There are {len(mcps)} MCP servers. Trim to essential ones for the clone.")

        workflows = config.get("workflows") or []
        if len(workflows) > 3:
            tweaks.append(f"Source has {len(workflows)} workflows. Select only the ones relevant to the clone's purpose.")

        if not tweaks:
            tweaks.append("No specific tweaks suggested. The source agent configuration looks clean.")

        return {
            "suggested_name": suggested_name,
            "suggested_tweaks": tweaks,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating clone suggestions for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate clone suggestions")
