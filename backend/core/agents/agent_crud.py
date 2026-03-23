from core.services.db import execute
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Query, Request

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.utils.config import config, EnvMode
from core.utils.pagination import PaginationParams
from core.utils.core_tools_helper import ensure_core_tools_enabled
from core.ai_models import model_manager

from core.api_models import (
    AgentUpdateRequest, AgentResponse, AgentVersionResponse, AgentsResponse, 
    PaginationInfo, AgentCreateRequest, AgentIconGenerationRequest, AgentIconGenerationResponse
)
from core.utils.mcp_helpers import merge_custom_mcps

async def _get_version_service():
    """Get the version service instance."""
    from core.versioning.version_service import get_version_service
    return await get_version_service()
from core.config.config_helper import build_unified_config

router = APIRouter(tags=["agents"])

@router.put("/agents/{agent_id}", response_model=AgentResponse, summary="Update Agent", operation_id="update_agent")
async def update_agent(
    agent_id: str,
    agent_data: AgentUpdateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    logger.debug(f"Updating agent {agent_id} for user: {user_id}")
    
    # Debug logging for icon fields
    if config.ENV_MODE == EnvMode.STAGING:
        logger.debug(
            f"[DEBUG] update_agent: Received icon fields - "
            f"icon_name={agent_data.icon_name}, "
            f"icon_color={agent_data.icon_color}, "
            f"icon_background={agent_data.icon_background}"
        )
    
    try:
        from core.agents import repo as agents_repo
        
        existing_agent_data = await agents_repo.get_agent_by_id(agent_id)
        
        if not existing_agent_data or existing_agent_data.get('account_id') != user_id:
            raise HTTPException(status_code=404, detail="Worker not found")
        
        existing_data = existing_agent_data

        agent_metadata = existing_data.get('metadata', {})
        is_recoder_agent = agent_metadata.get('is_recoder_default', False)
        restrictions = agent_metadata.get('restrictions', {})
        
        if is_recoder_agent:
            logger.warning(f"Update attempt on Recoder default agent {agent_id} by user {user_id}")
            
            if (agent_data.name is not None and 
                agent_data.name != existing_data.get('name') and 
                restrictions.get('name_editable') == False):
                logger.error(f"User {user_id} attempted to modify restricted name of Recoder agent {agent_id}")
                raise HTTPException(
                    status_code=403, 
                    detail="Recoder's name cannot be modified. This restriction is managed centrally."
                )
            
            
            if (agent_data.system_prompt is not None and 
                restrictions.get('system_prompt_editable') == False):
                logger.error(f"User {user_id} attempted to modify restricted system prompt of Recoder agent {agent_id}")
                raise HTTPException(
                    status_code=403, 
                    detail="Recoder's system prompt cannot be modified. This is managed centrally to ensure optimal performance."
                )
            
            if (agent_data.agentpress_tools is not None and 
                restrictions.get('tools_editable') == False):
                logger.error(f"User {user_id} attempted to modify restricted tools of Recoder agent {agent_id}")
                raise HTTPException(
                    status_code=403, 
                    detail="Recoder's default tools cannot be modified. These tools are optimized for Recoder's capabilities."
                )
            
            if ((agent_data.configured_mcps is not None or agent_data.custom_mcps is not None) and 
                restrictions.get('mcps_editable') == False):
                logger.error(f"User {user_id} attempted to modify restricted MCPs of Recoder agent {agent_id}")
                raise HTTPException(
                    status_code=403, 
                    detail="Recoder's integrations cannot be modified."
                )
            
            logger.debug(f"Recoder agent update validation passed for agent {agent_id} by user {user_id}")

        current_version_data = None
        if existing_data.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                current_version_obj = await version_service.get_version(
                    agent_id=agent_id,
                    version_id=existing_data['current_version_id'],
                    user_id=user_id
                )
                current_version_data = current_version_obj.to_dict()
            except Exception as e:
                logger.warning(f"Failed to get current version data for agent {agent_id}: {e}")
        
        if current_version_data is None:
            logger.debug(f"Agent {agent_id} has no version data, creating initial version")
            try:
                from core.versioning import repo as versioning_repo
                triggers = await versioning_repo.get_agent_triggers(agent_id)
                
                parsed_triggers = []
                if triggers:
                    import json
                    for trigger in triggers:
                        trigger_copy = trigger.copy()
                        if 'config' in trigger_copy and isinstance(trigger_copy['config'], str):
                            try:
                                trigger_copy['config'] = json.loads(trigger_copy['config'])
                            except json.JSONDecodeError:
                                logger.warning(f"Failed to parse trigger config for {trigger_copy.get('trigger_id')}")
                                trigger_copy['config'] = {}
                        parsed_triggers.append(trigger_copy)
                triggers = parsed_triggers
                
                initial_version_data = {
                    "agent_id": agent_id,
                    "version_number": 1,
                    "version_name": "v1",
                    "system_prompt": existing_data.get('system_prompt', ''),
                    "model": existing_data.get('model'),
                    "configured_mcps": existing_data.get('configured_mcps', []),
                    "custom_mcps": existing_data.get('custom_mcps', []),
                    "agentpress_tools": existing_data.get('agentpress_tools', {}),
                    "is_active": True,
                    "created_by": user_id
                }
                
                initial_config = build_unified_config(
                    system_prompt=initial_version_data["system_prompt"],
                    agentpress_tools=initial_version_data["agentpress_tools"],
                    configured_mcps=initial_version_data["configured_mcps"],
                    custom_mcps=initial_version_data["custom_mcps"],
                    triggers=triggers
                )
                initial_version_data["config"] = initial_config
                
                from core.versioning import repo as versioning_repo
                import uuid
                
                version_id = str(uuid.uuid4())
                await versioning_repo.create_agent_version_with_config(
                    version_id=version_id,
                    agent_id=agent_id,
                    version_number=1,
                    version_name="v1",
                    system_prompt=initial_version_data["system_prompt"],
                    model=initial_version_data["model"],
                    configured_mcps=initial_version_data["configured_mcps"],
                    custom_mcps=initial_version_data["custom_mcps"],
                    agentpress_tools=initial_version_data["agentpress_tools"],
                    triggers=triggers,
                    created_by=user_id
                )
                
                await agents_repo.update_agent_fields(
                    agent_id, user_id, 
                    current_version_id=version_id, 
                    version_count=1
                )
                current_version_data = initial_version_data
                logger.debug(f"Created initial version for agent {agent_id}")
            except Exception as e:
                logger.warning(f"Failed to create initial version for agent {agent_id}: {e}")
                current_version_data = {
                    'system_prompt': existing_data.get('system_prompt', ''),
                    'model': existing_data.get('model'),
                    'configured_mcps': existing_data.get('configured_mcps', []),
                    'custom_mcps': existing_data.get('custom_mcps', []),
                    'agentpress_tools': existing_data.get('agentpress_tools', {})
                }
        else:
            pass
        
        needs_new_version = False
        version_changes = {}
        
        def values_different(new_val, old_val):
            if new_val is None:
                return False
            import json
            try:
                new_json = json.dumps(new_val, sort_keys=True) if new_val is not None else None
                old_json = json.dumps(old_val, sort_keys=True) if old_val is not None else None
                return new_json != old_json
            except (TypeError, ValueError):
                return new_val != old_val
        
        if values_different(agent_data.system_prompt, current_version_data.get('system_prompt')):
            needs_new_version = True
            version_changes['system_prompt'] = agent_data.system_prompt
        
        if values_different(agent_data.model, current_version_data.get('model')):
            needs_new_version = True
            version_changes['model'] = agent_data.model
        
        if values_different(agent_data.configured_mcps, current_version_data.get('configured_mcps', [])):
            needs_new_version = True
            version_changes['configured_mcps'] = agent_data.configured_mcps
            
        if values_different(agent_data.custom_mcps, current_version_data.get('custom_mcps', [])):
            needs_new_version = True
            if agent_data.custom_mcps is not None:
                merged_custom_mcps = merge_custom_mcps(
                    current_version_data.get('custom_mcps', []),
                    agent_data.custom_mcps
                )
                version_changes['custom_mcps'] = merged_custom_mcps
            else:
                version_changes['custom_mcps'] = current_version_data.get('custom_mcps', [])
            
        if values_different(agent_data.agentpress_tools, current_version_data.get('agentpress_tools', {})):
            needs_new_version = True
            version_changes['agentpress_tools'] = agent_data.agentpress_tools
        
        update_data = {}
        if agent_data.name is not None:
            update_data["name"] = agent_data.name
        if agent_data.is_default is not None:
            update_data["is_default"] = agent_data.is_default
            if agent_data.is_default:
                await agents_repo.clear_default_agent(user_id, exclude_agent_id=agent_id)
        # Handle new icon system fields
        if agent_data.icon_name is not None:
            update_data["icon_name"] = agent_data.icon_name
        if agent_data.icon_color is not None:
            update_data["icon_color"] = agent_data.icon_color
        if agent_data.icon_background is not None:
            update_data["icon_background"] = agent_data.icon_background
        
        # Debug logging for update_data
        if config.ENV_MODE == EnvMode.STAGING:
            logger.debug(
                f"[DEBUG] update_agent: Prepared update_data with icon fields - "
                f"icon_name={update_data.get('icon_name')}, "
                f"icon_color={update_data.get('icon_color')}, "
                f"icon_background={update_data.get('icon_background')}"
            )
        
        current_system_prompt = agent_data.system_prompt if agent_data.system_prompt is not None else current_version_data.get('system_prompt', '')
        current_model = agent_data.model if agent_data.model is not None else current_version_data.get('model')

        if agent_data.configured_mcps is not None:
            if agent_data.replace_mcps:
                current_configured_mcps = agent_data.configured_mcps
                logger.debug(f"Replacing configured MCPs for agent {agent_id}: {current_configured_mcps}")
            else:
                current_configured_mcps = agent_data.configured_mcps
        else:
            current_configured_mcps = current_version_data.get('configured_mcps', [])
        
        # Handle custom MCPs - either replace or merge based on the flag
        if agent_data.custom_mcps is not None:
            if agent_data.replace_mcps:
                # Replace mode: use the provided list as-is
                current_custom_mcps = agent_data.custom_mcps
                logger.debug(f"Replacing custom MCPs for agent {agent_id}: {current_custom_mcps}")
            else:
                # Merge mode: merge with existing MCPs (default behavior)
                current_custom_mcps = merge_custom_mcps(
                    current_version_data.get('custom_mcps', []),
                    agent_data.custom_mcps
                )
                logger.debug(f"Merging custom MCPs for agent {agent_id}")
        else:
            current_custom_mcps = current_version_data.get('custom_mcps', [])

        current_agentpress_tools = agent_data.agentpress_tools if agent_data.agentpress_tools is not None else current_version_data.get('agentpress_tools', {})
        current_agentpress_tools = ensure_core_tools_enabled(current_agentpress_tools)
        new_version_id = None
        if needs_new_version:
            try:
                version_service = await _get_version_service()

                new_version = await version_service.create_version(
                    agent_id=agent_id,
                    user_id=user_id,
                    system_prompt=current_system_prompt,
                    model=current_model,
                    configured_mcps=current_configured_mcps,
                    custom_mcps=current_custom_mcps,
                    agentpress_tools=current_agentpress_tools,
                    change_description="Configuration updated"
                )
                
                new_version_id = new_version.version_id
                update_data['current_version_id'] = new_version_id
                update_data['version_count'] = new_version.version_number
                
                logger.debug(f"Created new version {new_version.version_name} for agent {agent_id}")
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error creating new version for agent {agent_id}: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to create new agent version: {str(e)}")
        
        if update_data:
            try:
                logger.debug(f"[DEBUG] update_agent DB UPDATE: About to update agent {agent_id} with data: {update_data}")
                
                success = await agents_repo.update_agent(
                    agent_id,
                    user_id, 
                    update_data
                )
                
                if config.ENV_MODE == EnvMode.STAGING:
                    logger.debug(f"[DEBUG] update_agent DB UPDATE SUCCESS: {success is not None}")
                
                if not success:
                    raise HTTPException(status_code=500, detail="Failed to update agent - no rows affected")
            except Exception as e:
                logger.error(f"Error updating agent {agent_id}: {str(e)}")
                if config.ENV_MODE == EnvMode.STAGING:
                    logger.debug(f"[DEBUG] update_agent DB UPDATE ERROR: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to update agent: {str(e)}")
        
        updated_agent = await agents_repo.get_agent_by_id(agent_id, user_id)
        
        if not updated_agent:
            raise HTTPException(status_code=500, detail="Failed to fetch updated agent")
        
        agent = updated_agent
        
        current_version = None
        if agent.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                current_version_obj = await version_service.get_version(
                    agent_id=agent_id,
                    version_id=agent['current_version_id'],
                    user_id=user_id
                )
                current_version_data = current_version_obj.to_dict()
                version_data = current_version_data
                
                current_version = AgentVersionResponse(
                    version_id=current_version_data['version_id'],
                    agent_id=current_version_data['agent_id'],
                    version_number=current_version_data['version_number'],
                    version_name=current_version_data['version_name'],
                    system_prompt=current_version_data['system_prompt'],
                    model=current_version_data.get('model'),
                    configured_mcps=current_version_data.get('configured_mcps', []),
                    custom_mcps=current_version_data.get('custom_mcps', []),
                    agentpress_tools=current_version_data.get('agentpress_tools', {}),
                    is_active=current_version_data.get('is_active', True),
                    created_at=current_version_data['created_at'],
                    updated_at=current_version_data.get('updated_at', current_version_data['created_at']),
                    created_by=current_version_data.get('created_by')
                )
                
                logger.debug(f"Using agent {agent['name']} version {current_version_data.get('version_name', 'v1')}")
            except Exception as e:
                logger.warning(f"Failed to get version data for updated agent {agent_id}: {e}")
        
        version_data = None
        if current_version:
            version_data = {
                'version_id': current_version.version_id,
                'agent_id': current_version.agent_id,
                'version_number': current_version.version_number,
                'version_name': current_version.version_name,
                'system_prompt': current_version.system_prompt,
                'model': current_version.model,
                'configured_mcps': current_version.configured_mcps,
                'custom_mcps': current_version.custom_mcps,
                'agentpress_tools': current_version.agentpress_tools,
                'is_active': current_version.is_active,
            }
        
        # Load the updated agent with full config
        from .agent_loader import get_agent_loader
        loader = await get_agent_loader()
        agent_data_obj = await loader.load_agent(agent_id, user_id, load_config=True)

        # Emit webhook event (fire-and-forget, never break main flow)
        try:
            from core.webhooks.webhook_service import webhook_service
            asyncio.create_task(webhook_service.send(user_id, "agent.updated", {
                "agent_id": agent_id,
            }))
        except Exception as wh_err:
            logger.warning(f"Webhook emission failed for agent.updated: {wh_err}")

        return agent_data_obj.to_pydantic_model()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent {agent_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update agent: {str(e)}")

@router.delete("/agents/{agent_id}", summary="Delete Agent", operation_id="delete_agent")
async def delete_agent(agent_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    from core.agents import repo as agents_repo
    
    logger.debug(f"Deleting agent: {agent_id}")
    
    try:
        # Get agent and verify ownership using direct SQL
        agent = await agents_repo.get_agent_by_id(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Worker not found")
        
        if agent['account_id'] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        if agent['is_default']:
            raise HTTPException(status_code=400, detail="Cannot delete default agent")
        
        if agent.get('metadata', {}).get('is_recoder_default', False):
            raise HTTPException(status_code=400, detail="Cannot delete Recoder default agent")
        
        # Clean up triggers before deleting agent
        try:
            from core.triggers.trigger_service import get_trigger_service
            trigger_service = get_trigger_service()
            
            triggers = await agents_repo.get_agent_triggers(agent_id)
            
            if triggers:
                logger.debug(f"Cleaning up {len(triggers)} triggers for agent {agent_id}")
                
                for trigger in triggers:
                    trigger_id = trigger['trigger_id']
                    try:
                        await trigger_service.delete_trigger(trigger_id)
                        logger.debug(f"Successfully cleaned up trigger {trigger_id}")
                    except Exception as e:
                        logger.warning(f"Failed to clean up trigger {trigger_id}: {str(e)}")
        except Exception as e:
            logger.warning(f"Failed to clean up triggers for agent {agent_id}: {str(e)}")
        
        # Delete the agent using direct SQL
        deleted = await agents_repo.delete_agent(agent_id, user_id)
        
        if not deleted:
            logger.warning(f"No agent was deleted for agent_id: {agent_id}, user_id: {user_id}")
            raise HTTPException(status_code=403, detail="Unable to delete agent - permission denied or agent not found")
        
        try:
            from core.cache.runtime_cache import invalidate_agent_config_cache
            await invalidate_agent_config_cache(agent_id)
            logger.debug(f"🗑️ Invalidated cache for deleted agent {agent_id}")
        except Exception as cache_error:
            logger.warning(f"Agent config cache invalidation failed for {agent_id}: {str(cache_error)}")
        
        try:
            from core.utils.cache import Cache
            await Cache.invalidate(f"agent_count_limit:{user_id}")
        except Exception as cache_error:
            logger.warning(f"Cache invalidation failed for user {user_id}: {str(cache_error)}")
        
        logger.debug(f"Successfully deleted agent: {agent_id}")

        # Emit webhook event (fire-and-forget, never break main flow)
        try:
            from core.webhooks.webhook_service import webhook_service
            asyncio.create_task(webhook_service.send(user_id, "agent.deleted", {
                "agent_id": agent_id,
            }))
        except Exception as wh_err:
            logger.warning(f"Webhook emission failed for agent.deleted: {wh_err}")

        return {"message": "Worker deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/agents", response_model=AgentsResponse, summary="List Agents", operation_id="list_agents")
async def get_agents(
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    page: Optional[int] = Query(1, ge=1, description="Page number (1-based)"),
    limit: Optional[int] = Query(20, ge=1, le=100, description="Number of items per page"),
    search: Optional[str] = Query(None, description="Search in name"),
    sort_by: Optional[str] = Query("created_at", description="Sort field: name, created_at, updated_at, tools_count"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc, desc"),
    has_default: Optional[bool] = Query(None, description="Filter by default agents"),
    has_mcp_tools: Optional[bool] = Query(None, description="Filter by agents with MCP tools"),
    has_agentpress_tools: Optional[bool] = Query(None, description="Filter by agents with AgentPress tools"),
    tools: Optional[str] = Query(None, description="Comma-separated list of tools to filter by"),
    content_type: Optional[str] = Query(None, description="Content type filter: 'agents', 'templates', or None for agents only")
):
    try:
        from .agent_service import AgentService, AgentFilters
        
        tools_list = []
        if tools:
            if isinstance(tools, str):
                tools_list = [tool.strip() for tool in tools.split(',') if tool.strip()]
            else:
                logger.warning(f"Unexpected tools parameter type: {type(tools)}")
        
        pagination_params = PaginationParams(
            page=page,
            page_size=limit
        )
        
        filters = AgentFilters(
            search=search,
            has_default=has_default,
            has_mcp_tools=has_mcp_tools,
            has_agentpress_tools=has_agentpress_tools,
            tools=tools_list,
            content_type=content_type,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        agent_service = AgentService()
        paginated_result = await agent_service.get_agents_paginated(
            user_id=user_id,
            pagination_params=pagination_params,
            filters=filters
        )
        
        agent_responses = []
        for agent_data in paginated_result.data:
            agent_response = AgentResponse(**agent_data)
            agent_responses.append(agent_response)
        
        return AgentsResponse(
            agents=agent_responses,
            pagination=PaginationInfo(
                current_page=paginated_result.pagination.current_page,
                page_size=paginated_result.pagination.page_size,
                total_items=paginated_result.pagination.total_items,
                total_pages=paginated_result.pagination.total_pages,
                has_next=paginated_result.pagination.has_next,
                has_previous=paginated_result.pagination.has_previous
            )
        )
        
    except HTTPException:
        # Re-raise HTTPExceptions (like 401, 429) as-is without wrapping
        raise
    except Exception as e:
        logger.error("Error fetching agents for user", user_id=user_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch agents: {str(e)}")


@router.get("/agents/runs", summary="List Agent Runs", operation_id="list_all_runs_v2")
async def list_all_agent_runs_v2(
    limit: int = 20,
    offset: int = 0,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all agent runs for the authenticated user."""
    try:
        rows = await execute(
            """SELECT ar.id, ar.agent_id, ar.thread_id, ar.status, ar.started_at, ar.completed_at, ar.cost,
                      a.name as agent_name
               FROM agent_runs ar
               LEFT JOIN agents a ON a.agent_id = ar.agent_id
               WHERE a.account_id = :user_id
               ORDER BY ar.started_at DESC NULLS LAST
               LIMIT :limit OFFSET :offset""",
            {"user_id": user_id, "limit": limit, "offset": offset},
        )
        return {"runs": [dict(r) for r in (rows or [])], "total": len(rows or [])}
    except Exception as e:
        logger.warning(f"Error listing runs: {e}")
        return {"runs": [], "total": 0}


@router.get("/agents/{agent_id}", response_model=AgentResponse, summary="Get Agent", operation_id="get_agent")
async def get_agent(agent_id: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Get a single agent with full configuration."""
    logger.debug(f"Fetching agent {agent_id} for user: {user_id}")
    
    try:
        from .agent_loader import get_agent_loader
        loader = await get_agent_loader()
        
        agent_data = await loader.load_agent(agent_id, user_id, load_config=True)
        return agent_data.to_pydantic_model()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent {agent_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch agent: {str(e)}")

@router.post("/agents", response_model=AgentResponse, summary="Create Agent", operation_id="create_agent")
async def create_agent(
    agent_data: AgentCreateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    from core.agents import repo as agents_repo
    
    logger.debug(f"Creating new agent for user: {user_id}")

    from core.utils.limits_checker import check_agent_count_limit
    limit_check = await check_agent_count_limit(user_id)
    
    if not limit_check['can_create']:
        error_detail = {
            "message": f"Maximum of {limit_check['limit']} agents allowed for your current plan. You have {limit_check['current_count']} agents.",
            "current_count": limit_check['current_count'],
            "limit": limit_check['limit'],
            "tier_name": limit_check['tier_name'],
            "error_code": "AGENT_LIMIT_EXCEEDED"
        }
        logger.warning(f"Agent limit exceeded for account {user_id}: {limit_check['current_count']}/{limit_check['limit']} agents")
        raise HTTPException(status_code=402, detail=error_detail)
    
    try:
        # Clear existing default if setting new default
        if agent_data.is_default:
            await agents_repo.clear_default_agent(user_id)
        
        if config.ENV_MODE == EnvMode.STAGING:
            logger.debug(
                f"[DEBUG] create_agent: Creating with "
                f"icon_name={agent_data.icon_name or 'bot'}, "
                f"icon_color={agent_data.icon_color or '#000000'}, "
                f"icon_background={agent_data.icon_background or '#F3F4F6'}"
            )
        
        # Create agent using direct SQL
        agent = await agents_repo.create_agent(
            account_id=user_id,
            name=agent_data.name,
            icon_name=agent_data.icon_name or "bot",
            icon_color=agent_data.icon_color or "#000000",
            icon_background=agent_data.icon_background or "#F3F4F6",
            is_default=agent_data.is_default or False
        )
        
        if not agent:
            raise HTTPException(status_code=500, detail="Failed to create agent")
        
        try:
            version_service = await _get_version_service()
            from core.config.recoder_config import SUNA_CONFIG
            from core.config.config_helper import _get_default_agentpress_tools
            from core.ai_models import model_manager
            
            system_prompt = SUNA_CONFIG["system_prompt"]
            
            agentpress_tools = agent_data.agentpress_tools if agent_data.agentpress_tools else _get_default_agentpress_tools()
            agentpress_tools = ensure_core_tools_enabled(agentpress_tools)
            
            default_model = await model_manager.get_default_model_for_user(None, user_id)
            
            version = await version_service.create_version(
                agent_id=agent['agent_id'],
                user_id=user_id,
                system_prompt=system_prompt,
                model=default_model,
                configured_mcps=agent_data.configured_mcps or [],
                custom_mcps=agent_data.custom_mcps or [],
                agentpress_tools=agentpress_tools,
                version_name="v1",
                change_description="Initial version"
            )
            
            agent['current_version_id'] = version.version_id
            agent['version_count'] = 1

            current_version = AgentVersionResponse(
                version_id=version.version_id,
                agent_id=version.agent_id,
                version_number=version.version_number,
                version_name=version.version_name,
                system_prompt=version.system_prompt,
                model=version.model,
                configured_mcps=version.configured_mcps,
                custom_mcps=version.custom_mcps,
                agentpress_tools=version.agentpress_tools,
                is_active=version.is_active,
                created_at=version.created_at.isoformat(),
                updated_at=version.updated_at.isoformat(),
                created_by=version.created_by
            )
        except Exception as e:
            logger.error(f"Error creating initial version: {str(e)}")
            # Rollback agent creation using direct SQL
            await agents_repo.delete_agent(agent['agent_id'], user_id)
            raise HTTPException(status_code=500, detail="Failed to create initial version")
        
        from core.utils.cache import Cache
        await Cache.invalidate(f"agent_count_limit:{user_id}")
        
        logger.debug(f"Created agent {agent['agent_id']} with v1 for user: {user_id}")

        # Load the created agent with full config
        from .agent_loader import get_agent_loader
        loader = await get_agent_loader()
        agent_data = await loader.load_agent(agent['agent_id'], user_id, load_config=True)

        # Emit webhook event (fire-and-forget, never break main flow)
        try:
            from core.webhooks.webhook_service import webhook_service
            asyncio.create_task(webhook_service.send(user_id, "agent.created", {
                "agent_id": agent['agent_id'],
                "name": agent.get('name', ''),
            }))
        except Exception as wh_err:
            logger.warning(f"Webhook emission failed for agent.created: {wh_err}")

        return agent_data.to_pydantic_model()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")

@router.post("/agents/generate-icon", response_model=AgentIconGenerationResponse, summary="Generate Agent Icon", operation_id="generate_agent_icon")
async def generate_agent_icon(
    request: AgentIconGenerationRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Generate an appropriate icon and colors for an agent based on its name."""
    logger.debug(f"Generating icon and colors for agent: {request.name}")
    
    try:
        from core.utils.icon_generator import generate_icon_and_colors as generate_agent_icon_and_colors
        
        result = await generate_agent_icon_and_colors(
            name=request.name
        )
        
        response = AgentIconGenerationResponse(
            icon_name=result["icon_name"],
            icon_color=result["icon_color"],
            icon_background=result["icon_background"]
        )
        
        logger.debug(f"Generated agent icon: {response.icon_name}, colors: {response.icon_color}/{response.icon_background}")
        return response
        
    except Exception as e:
        logger.error(f"Error generating agent icon for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate agent icon: {str(e)}")


@router.post("/agents/{agent_id}/clone", response_model=AgentResponse, summary="Clone Agent", operation_id="clone_agent")
async def clone_agent(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Clone an agent, creating a copy with all configuration but no history."""
    from core.agents import repo as agents_repo

    logger.debug(f"Cloning agent {agent_id} for user: {user_id}")

    # Check agent count limit
    from core.utils.limits_checker import check_agent_count_limit
    limit_check = await check_agent_count_limit(user_id)

    if not limit_check['can_create']:
        error_detail = {
            "message": f"Maximum of {limit_check['limit']} agents allowed for your current plan. You have {limit_check['current_count']} agents.",
            "current_count": limit_check['current_count'],
            "limit": limit_check['limit'],
            "tier_name": limit_check['tier_name'],
            "error_code": "AGENT_LIMIT_EXCEEDED"
        }
        logger.warning(f"Agent limit exceeded for account {user_id}: {limit_check['current_count']}/{limit_check['limit']} agents")
        raise HTTPException(status_code=402, detail=error_detail)

    try:
        # Get source agent and verify ownership
        source_agent = await agents_repo.get_agent_by_id(agent_id)
        if not source_agent:
            raise HTTPException(status_code=404, detail="Source agent not found")

        if source_agent.get('account_id') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Get source agent's active version config
        source_version_data = None
        if source_agent.get('current_version_id'):
            try:
                version_service = await _get_version_service()
                source_version = await version_service.get_version(
                    agent_id=agent_id,
                    version_id=source_agent['current_version_id'],
                    user_id=user_id
                )
                source_version_data = source_version.to_dict()
            except Exception as e:
                logger.warning(f"Failed to get version data for source agent {agent_id}: {e}")

        # Create the cloned agent
        cloned_name = f"{source_agent.get('name', 'Agent')} (Copy)"
        new_agent = await agents_repo.create_agent(
            account_id=user_id,
            name=cloned_name,
            description=source_agent.get('description'),
            icon_name=source_agent.get('icon_name', 'bot'),
            icon_color=source_agent.get('icon_color', '#000000'),
            icon_background=source_agent.get('icon_background', '#F3F4F6'),
            is_default=False
        )

        if not new_agent:
            raise HTTPException(status_code=500, detail="Failed to create cloned agent")

        # Create initial version for the cloned agent with source config
        try:
            version_service = await _get_version_service()

            system_prompt = ''
            model_value = None
            configured_mcps = []
            custom_mcps = []
            agentpress_tools = {}

            if source_version_data:
                system_prompt = source_version_data.get('system_prompt', '')
                model_value = source_version_data.get('model')
                configured_mcps = source_version_data.get('configured_mcps', [])
                custom_mcps = source_version_data.get('custom_mcps', [])
                agentpress_tools = source_version_data.get('agentpress_tools', {})
            else:
                # Fallback: use default config
                from core.config.recoder_config import SUNA_CONFIG
                from core.config.config_helper import _get_default_agentpress_tools
                system_prompt = SUNA_CONFIG["system_prompt"]
                agentpress_tools = _get_default_agentpress_tools()
                default_model = await model_manager.get_default_model_for_user(None, user_id)
                model_value = default_model

            agentpress_tools = ensure_core_tools_enabled(agentpress_tools)

            version = await version_service.create_version(
                agent_id=new_agent['agent_id'],
                user_id=user_id,
                system_prompt=system_prompt,
                model=model_value,
                configured_mcps=configured_mcps,
                custom_mcps=custom_mcps,
                agentpress_tools=agentpress_tools,
                version_name="v1",
                change_description=f"Cloned from {source_agent.get('name', 'agent')}"
            )

            new_agent['current_version_id'] = version.version_id
            new_agent['version_count'] = 1

        except Exception as e:
            logger.error(f"Error creating version for cloned agent: {str(e)}")
            # Rollback: delete the agent we just created
            await agents_repo.delete_agent(new_agent['agent_id'], user_id)
            raise HTTPException(status_code=500, detail="Failed to create cloned agent version")

        # Invalidate caches
        from core.utils.cache import Cache
        await Cache.invalidate(f"agent_count_limit:{user_id}")

        # Load the full agent data
        from .agent_loader import get_agent_loader
        loader = await get_agent_loader()
        agent_data = await loader.load_agent(new_agent['agent_id'], user_id, load_config=True)

        # Emit webhook event
        try:
            from core.webhooks.webhook_service import webhook_service
            asyncio.create_task(webhook_service.send(user_id, "agent.cloned", {
                "agent_id": new_agent['agent_id'],
                "source_agent_id": agent_id,
                "name": cloned_name,
            }))
        except Exception as wh_err:
            logger.warning(f"Webhook emission failed for agent.cloned: {wh_err}")

        logger.debug(f"Cloned agent {agent_id} -> {new_agent['agent_id']} for user: {user_id}")
        return agent_data.to_pydantic_model()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cloning agent {agent_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to clone agent: {str(e)}")
