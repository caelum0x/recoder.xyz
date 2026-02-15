import math
from typing import List, Dict, Any, Optional, Tuple
from core.utils.pagination import PaginationService, PaginationParams, PaginatedResponse, PaginationMeta
from core.utils.logger import logger
from core.agents.agent_loader import AgentLoader
from core.services.db import Table, execute, execute_read, execute_one, execute_mutate


class AgentFilters:
    def __init__(
        self,
        search: Optional[str] = None,
        has_default: Optional[bool] = None,
        has_mcp_tools: Optional[bool] = None,
        has_agentpress_tools: Optional[bool] = None,
        tools: Optional[List[str]] = None,
        content_type: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ):
        self.search = search
        self.has_default = has_default
        self.has_mcp_tools = has_mcp_tools
        self.has_agentpress_tools = has_agentpress_tools
        self.tools = tools or []
        self.content_type = content_type
        self.sort_by = sort_by
        self.sort_order = sort_order


class AgentService:
    def __init__(self, db_client=None):
        self.db = db_client  # Kept for backward compatibility; not used internally
        self.loader = AgentLoader(db_client)

    async def get_agents_paginated(
        self,
        user_id: str,
        pagination_params: PaginationParams,
        filters: AgentFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        try:
            logger.debug(f"Fetching content for user {user_id} with filters: {filters.__dict__}")
            
            # Handle unified agent/template content types
            if filters.content_type == "templates":
                return await self._get_user_templates_paginated(user_id, pagination_params, filters)
            else:
                # Default behavior: show only agents (content_type == "agents" or None)
                return await self._get_only_agents_paginated(user_id, pagination_params, filters)
                
        except Exception as e:
            logger.error(f"Error fetching content for user {user_id}: {e}", exc_info=True)
            raise

    async def _get_only_agents_paginated(
        self,
        user_id: str,
        pagination_params: PaginationParams,
        filters: AgentFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        """Get only agents (not templates) with pagination"""
        needs_post_processing = (
            filters.has_mcp_tools is not None or
            filters.has_agentpress_tools is not None or
            len(filters.tools) > 0 or
            filters.sort_by == "tools_count"
        )

        if needs_post_processing:
            return await self._get_agents_with_complex_filtering(
                user_id, pagination_params, filters
            )
        else:
            return await self._get_agents_database_paginated(
                pagination_params, filters, user_id=user_id
            )

    async def _get_user_templates_paginated(
        self,
        user_id: str,
        pagination_params: PaginationParams,
        filters: AgentFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        try:
            where_clauses = ["creator_id = :creator_id"]
            params: Dict[str, Any] = {"creator_id": user_id}

            # Apply search filter
            if filters.search:
                where_clauses.append("(name ILIKE :search OR description ILIKE :search)")
                params["search"] = f"%{filters.search}%"

            where_sql = " AND ".join(where_clauses)

            # Count total
            count_sql = f"SELECT COUNT(*) FROM agent_templates WHERE {where_sql}"
            count_rows = await execute_read(count_sql, params)
            total_count = count_rows[0]["count"] if count_rows else 0

            if total_count == 0:
                return PaginatedResponse(
                    data=[],
                    pagination=PaginationMeta(
                        current_page=pagination_params.page,
                        page_size=pagination_params.page_size,
                        total_items=0,
                        total_pages=0,
                        has_next=False,
                        has_previous=False
                    )
                )

            # Apply sorting for templates
            sort_direction = "DESC" if filters.sort_order == "desc" else "ASC"
            if filters.sort_by == "name":
                order_sql = f"name {sort_direction}"
            elif filters.sort_by == "download_count":
                order_sql = f"download_count {sort_direction}, created_at DESC"
            else:
                # Default to created_at
                order_sql = f"created_at {sort_direction}"

            offset = (pagination_params.page - 1) * pagination_params.page_size
            params["limit"] = pagination_params.page_size
            params["offset"] = offset

            data_sql = f"SELECT * FROM agent_templates WHERE {where_sql} ORDER BY {order_sql} LIMIT :limit OFFSET :offset"
            items = await execute_read(data_sql, params)

            # Transform template data to match agent response format
            template_responses = []
            for template_data in items:
                transformed_template = await self._transform_template_to_agent_format(template_data)
                template_responses.append(transformed_template)

            total_pages = max(1, math.ceil(total_count / pagination_params.page_size))

            return PaginatedResponse(
                data=template_responses,
                pagination=PaginationMeta(
                    current_page=pagination_params.page,
                    page_size=pagination_params.page_size,
                    total_items=total_count,
                    total_pages=total_pages,
                    has_next=pagination_params.page < total_pages,
                    has_previous=pagination_params.page > 1
                )
            )

        except Exception as e:
            logger.error(f"Error fetching templates for user {user_id}: {e}", exc_info=True)
            raise

    def _build_agents_where(self, user_id: str, filters: AgentFilters) -> Tuple[str, Dict[str, Any]]:
        """Build WHERE clause and params for agents queries."""
        where_clauses = ["account_id = :account_id"]
        params: Dict[str, Any] = {"account_id": user_id}

        if filters.search:
            where_clauses.append("(name ILIKE :search OR description ILIKE :search)")
            params["search"] = f"%{filters.search}%"

        if filters.has_default is not None:
            where_clauses.append("is_default = :is_default")
            params["is_default"] = filters.has_default

        where_sql = " AND ".join(where_clauses)
        return where_sql, params

    def _build_agents_order_by(self, filters: AgentFilters) -> str:
        """Build ORDER BY clause for agents queries."""
        if filters.sort_by == "tools_count":
            return ""  # Handled in post-processing
        sort_column = filters.sort_by if filters.sort_by in ["name", "created_at", "updated_at"] else "created_at"
        sort_direction = "DESC" if filters.sort_order == "desc" else "ASC"
        return f"{sort_column} {sort_direction}"

    async def _get_agents_database_paginated(
        self,
        pagination_params: PaginationParams,
        filters: AgentFilters,
        user_id: str = None
    ) -> PaginatedResponse[Dict[str, Any]]:
        from core.agents import repo as agents_repo

        offset = (pagination_params.page - 1) * pagination_params.page_size

        agents, total_count = await agents_repo.list_agents(
            account_id=user_id,
            limit=pagination_params.page_size,
            offset=offset,
            search=filters.search,
            has_default=filters.has_default,
            sort_by=filters.sort_by,
            sort_order=filters.sort_order
        )

        # Transform to API format
        agent_responses = [
            await self._transform_agent_data(row, load_config=False)
            for row in agents
        ]

        total_pages = (total_count + pagination_params.page_size - 1) // pagination_params.page_size if total_count else 0

        return PaginatedResponse(
            data=agent_responses,
            pagination=PaginationMeta(
                current_page=pagination_params.page,
                page_size=pagination_params.page_size,
                total_items=total_count,
                total_pages=total_pages,
                has_next=pagination_params.page < total_pages,
                has_previous=pagination_params.page > 1
            )
        )

    async def _get_agents_with_complex_filtering(
        self,
        user_id: str,
        pagination_params: PaginationParams,
        filters: AgentFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        # Fetch all matching agents for in-memory filtering
        where_sql, params = self._build_agents_where(user_id, filters)
        order_by = self._build_agents_order_by(filters)
        order_clause = f"ORDER BY {order_by}" if order_by else ""

        sql = f"SELECT * FROM agents WHERE {where_sql} {order_clause}"
        all_agents = await execute_read(sql, params)

        if not all_agents:
            return PaginatedResponse(
                data=[],
                pagination=PaginationMeta(
                    current_page=pagination_params.page,
                    page_size=pagination_params.page_size,
                    total_items=0,
                    total_pages=0,
                    has_next=False,
                    has_previous=False
                )
            )
        
        version_map = await self._load_agent_versions_batch(all_agents)
        
        filtered_agents = []
        for agent_data in all_agents:
            if await self._passes_complex_filters(agent_data, version_map, filters):
                filtered_agents.append(agent_data)
        
        if filters.sort_by == "tools_count":
            filtered_agents = await self._sort_by_tools_count(filtered_agents, version_map)
        elif filters.sort_order == "desc":
            filtered_agents.reverse()
        
        # Transform with configs loaded
        agent_responses = await self._load_agents_with_configs(filtered_agents, version_map)
        
        return await PaginationService.paginate_filtered_dataset(
            all_items=agent_responses,
            params=pagination_params
        )

    async def _load_agent_versions_batch(self, agents: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        version_map = {}
        version_ids = list({agent['current_version_id'] for agent in agents if agent.get('current_version_id')})
        
        if version_ids:
            try:
                # Use versioning service instead of direct config access
                from core.versioning.version_service import get_version_service
                version_service = await get_version_service()
                
                version_map = {}
                for agent in agents:
                    version_id = agent.get('current_version_id')
                    if version_id:
                        try:
                            # Get version data using versioning service
                            version = await version_service.get_version(
                                agent_id=agent['agent_id'],
                                version_id=version_id,
                                user_id=agent['account_id']  # Use account_id as user_id
                            )
                            if version:
                                version_dict = version.to_dict()
                                version_map[agent['agent_id']] = version_dict
                        except Exception as e:
                            logger.warning(f"Failed to load version {version_id} for agent {agent['agent_id']}: {e}")
                            continue
                        
            except Exception as e:
                logger.warning(f"Failed to batch load agent versions: {e}")
                version_map = {}

    async def _passes_complex_filters(
        self, 
        agent_row: Dict[str, Any], 
        version_map: Dict[str, Dict[str, Any]], 
        filters: AgentFilters
    ) -> bool:
        # Load agent with config
        agent = self.loader._row_to_agent_data(agent_row)
        version_data = version_map.get(agent.agent_id)
        
        if version_data:
            self.loader._apply_version_config(agent, version_data)
        elif agent.is_recoder_default:
            await self.loader._load_recoder_config(agent, agent.account_id)
        else:
            # No config available, use empty defaults for filtering
            agent.configured_mcps = []
            agent.agentpress_tools = {}
        
        configured_mcps = agent.configured_mcps or []
        agentpress_tools = agent.agentpress_tools or {}
        
        if filters.has_mcp_tools is not None:
            has_mcp = bool(configured_mcps and len(configured_mcps) > 0)
            if filters.has_mcp_tools != has_mcp:
                return False
        
        if filters.has_agentpress_tools is not None:
            has_enabled_tools = any(
                tool_data and isinstance(tool_data, dict) and tool_data.get('enabled', False)
                for tool_data in agentpress_tools.values()
            )
            if filters.has_agentpress_tools != has_enabled_tools:
                return False
        
        if filters.tools:
            agent_tools = set()

            for mcp in configured_mcps:
                if isinstance(mcp, dict) and 'name' in mcp:
                    agent_tools.add(f"mcp:{mcp['name']}")
            
            for tool_name, tool_data in agentpress_tools.items():
                if tool_data and isinstance(tool_data, dict) and tool_data.get('enabled', False):
                    agent_tools.add(f"agentpress:{tool_name}")
            
            if not any(tool in agent_tools for tool in filters.tools):
                return False
        
        return True

    async def _sort_by_tools_count(
        self, 
        agents: List[Dict[str, Any]], 
        version_map: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        agent_tool_counts = []
        for agent_row in agents:
            agent = self.loader._row_to_agent_data(agent_row)
            version_data = version_map.get(agent.agent_id)
            
            if version_data:
                self.loader._apply_version_config(agent, version_data)
            elif agent.is_recoder_default:
                await self.loader._load_recoder_config(agent, agent.account_id)
            
            configured_mcps = agent.configured_mcps or []
            agentpress_tools = agent.agentpress_tools or {}
            
            mcp_count = len(configured_mcps) if configured_mcps else 0
            agentpress_count = sum(
                1 for tool_data in agentpress_tools.values()
                if tool_data and isinstance(tool_data, dict) and tool_data.get('enabled', False)
            ) if agentpress_tools else 0
            
            tools_count = mcp_count + agentpress_count
            agent_tool_counts.append((agent_row, tools_count))
        
        agent_tool_counts.sort(key=lambda x: x[1], reverse=True)
        return [agent_row for agent_row, _ in agent_tool_counts]
    
    async def _load_agents_with_configs(
        self,
        agent_rows: List[Dict[str, Any]],
        version_map: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Load agents and apply their configurations from version_map.
        
        Args:
            agent_rows: List of agent database rows
            version_map: Pre-fetched version data by agent_id
            
        Returns:
            List of API response dictionaries
        """
        agent_datas = []
        for row in agent_rows:
            agent = self.loader._row_to_agent_data(row)
            
            # Apply config if available
            version_data = version_map.get(agent.agent_id)
            if version_data:
                self.loader._apply_version_config(agent, version_data)
                agent.config_loaded = True
            elif agent.is_recoder_default:
                await self.loader._load_recoder_config(agent, agent.account_id)
                agent.config_loaded = True
            
            agent_datas.append(agent.to_dict())
        
        return agent_datas

    async def _transform_agent_data(
        self, 
        agent_row: Dict[str, Any], 
        load_config: bool = False
    ) -> Dict[str, Any]:
        """
        Transform agent database row to API response.
        
        Args:
            agent_row: Raw agent database row
            load_config: Whether to include full configuration
            
        Returns:
            API response dictionary
        """
        # Use unified loader for consistent transformation
        agent_data = self.loader._row_to_agent_data(agent_row)
        
        # Load config if needed and version exists
        if load_config and agent_data.current_version_id:
            # Note: For list operations, we typically don't load individual configs
            # Instead, use batch loading via _load_agents_with_configs
            pass
        
        return agent_data.to_dict()

    async def _transform_template_to_agent_format(self, template_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform template to agent format using unified loader."""
        agent_data = await self.loader.load_template(template_data, fetch_creator_name=True)
        result = agent_data.to_dict()
        
        # Add template-specific fields
        result.update({
            "template_id": template_data.get('template_id'),
            "mcp_requirements": template_data.get('mcp_requirements', []),
            "marketplace_published_at": template_data.get('marketplace_published_at'),
            "download_count": template_data.get('download_count', 0),
            "creator_name": agent_data.metadata.get('creator_name'),
            "creator_id": template_data.get('creator_id'),
            "is_recoder_team": template_data.get('is_recoder_team', False)
        })
        
        return result 