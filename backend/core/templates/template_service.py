import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from uuid import uuid4
import secrets
import string

from core.services.db import Table, execute, execute_read, execute_one, execute_mutate
from core.utils.logger import logger

ConfigType = Dict[str, Any]
ProfileId = str
QualifiedName = str

@dataclass(frozen=True)
class MCPRequirementValue:
    qualified_name: str
    display_name: str
    enabled_tools: List[str] = field(default_factory=list)
    required_config: List[str] = field(default_factory=list)
    custom_type: Optional[str] = None
    toolkit_slug: Optional[str] = None
    app_slug: Optional[str] = None
    source: Optional[str] = None
    trigger_index: Optional[int] = None
    
    def is_custom(self) -> bool:
        if self.custom_type == 'composio' or self.qualified_name.startswith('composio.'):
            return False
        return self.custom_type is not None and self.qualified_name.startswith('custom_')

@dataclass(frozen=True)
class AgentTemplate:
    template_id: str
    creator_id: str
    name: str
    config: ConfigType
    tags: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)
    is_public: bool = False
    is_recoder_team: bool = False
    marketplace_published_at: Optional[datetime] = None
    download_count: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    icon_name: Optional[str] = None
    icon_color: Optional[str] = None
    icon_background: Optional[str] = None
    metadata: ConfigType = field(default_factory=dict)
    creator_name: Optional[str] = None
    usage_examples: List[Dict[str, Any]] = field(default_factory=list)
    
    def with_public_status(self, is_public: bool, published_at: Optional[datetime] = None) -> 'AgentTemplate':
        return AgentTemplate(
            **{**self.__dict__, 
               'is_public': is_public, 
               'marketplace_published_at': published_at}
        )
    
    @property
    def system_prompt(self) -> str:
        return self.config.get('system_prompt', '')
    
    @property
    def agentpress_tools(self) -> Dict[str, Any]:
        return self.config.get('tools', {}).get('agentpress', {})
    
    
    @property
    def mcp_requirements(self) -> List[MCPRequirementValue]:
        requirements = []
        
        mcps = self.config.get('tools', {}).get('mcp', [])
        for mcp in mcps:
            if isinstance(mcp, dict) and mcp.get('name'):
                qualified_name = mcp.get('qualifiedName', mcp['name'])
                
                requirements.append(MCPRequirementValue(
                    qualified_name=qualified_name,
                    display_name=mcp.get('display_name') or mcp['name'],
                    enabled_tools=mcp.get('enabledTools', []),
                    required_config=mcp.get('requiredConfig', []),
                    source='tool'
                ))
        
        custom_mcps = self.config.get('tools', {}).get('custom_mcp', [])
        for mcp in custom_mcps:
            if isinstance(mcp, dict) and mcp.get('name'):
                mcp_type = mcp.get('type', 'sse')
                mcp_name = mcp['name']
                
                qualified_name = mcp.get('mcp_qualified_name') or mcp.get('qualifiedName')
                if not qualified_name:
                    if mcp_type == 'composio':
                        toolkit_slug = mcp.get('toolkit_slug') or mcp_name.lower().replace(' ', '_')
                        qualified_name = f"composio.{toolkit_slug}"
                    else:
                        safe_name = mcp_name.replace(' ', '_').lower()
                        qualified_name = f"custom_{mcp_type}_{safe_name}"
                
                if mcp_type == 'composio':
                    required_config = []
                elif mcp_type in ['http', 'sse', 'json']:
                    required_config = ['url']
                else:
                    required_config = mcp.get('requiredConfig', ['url'])
                
                requirements.append(MCPRequirementValue(
                    qualified_name=qualified_name,
                    display_name=mcp.get('display_name') or mcp_name,
                    enabled_tools=mcp.get('enabledTools', []),
                    required_config=required_config,
                    custom_type=mcp_type,
                    toolkit_slug=mcp.get('toolkit_slug') if mcp_type == 'composio' else None,
                    app_slug=None,
                    source='tool'
                ))
        
        triggers = self.config.get('triggers', [])
        
        for i, trigger in enumerate(triggers):
            config = trigger.get('config', {})
            provider_id = config.get('provider_id', '')
            
            if provider_id == 'composio':
                qualified_name = config.get('qualified_name')
                
                if not qualified_name:
                    trigger_slug = config.get('trigger_slug', '')
                    if trigger_slug:
                        app_name = trigger_slug.split('_')[0].lower() if '_' in trigger_slug else 'composio'
                        qualified_name = f'composio.{app_name}'
                    else:
                        qualified_name = 'composio'
                
                if qualified_name:
                    if qualified_name.startswith('composio.'):
                        app_name = qualified_name.split('.', 1)[1]
                    else:
                        app_name = 'composio'
                    
                    trigger_name = trigger.get('name', f'Trigger {i+1}')
                    
                    composio_req = MCPRequirementValue(
                        qualified_name=qualified_name,
                        display_name=f"{app_name.title()} ({trigger_name})",
                        enabled_tools=[],
                        required_config=[],
                        custom_type=None,
                        toolkit_slug=app_name,
                        app_slug=app_name,
                        source='trigger',
                        trigger_index=i
                    )
                    requirements.append(composio_req)
        
        return requirements

@dataclass
class TemplateCreationRequest:
    agent_id: str
    creator_id: str
    make_public: bool = False
    tags: Optional[List[str]] = None

class TemplateNotFoundError(Exception):
    pass

class TemplateAccessDeniedError(Exception):
    pass

class RecoderDefaultAgentTemplateError(Exception):
    pass

class TemplateService:
    def __init__(self):
        self._templates = Table("agent_templates").json_columns("config", "metadata", "tags", "categories", "usage_examples")
        self._agents = Table("agents").json_columns("metadata")
        self._agent_versions = Table("agent_versions").json_columns("config")

    async def create_from_agent(
        self,
        agent_id: str,
        creator_id: str,
        make_public: bool = False,
        tags: Optional[List[str]] = None,
        usage_examples: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        logger.debug(f"Creating template from agent {agent_id} for user {creator_id}")
        
        agent = await self._get_agent_by_id(agent_id)
        if not agent:
            raise TemplateNotFoundError("Worker not found")
        
        if agent['account_id'] != creator_id:
            raise TemplateAccessDeniedError("You can only create templates from your own agents")
        
        if self._is_recoder_default_agent(agent):
            raise RecoderDefaultAgentTemplateError("Cannot create template from Recoder default agent")
        
        version_config = await self._get_agent_version_config(agent)
        if not version_config:
            raise TemplateNotFoundError("Agent has no version configuration")
        
        sanitized_config = await self._sanitize_config_for_template(version_config)
        
        template = AgentTemplate(
            template_id=str(uuid4()),
            creator_id=creator_id,
            name=agent['name'],
            config=sanitized_config,
            tags=tags or [],
            categories=[],
            is_public=make_public,
            marketplace_published_at=datetime.now(timezone.utc) if make_public else None,
            icon_name=agent.get('icon_name'),
            icon_color=agent.get('icon_color'),
            icon_background=agent.get('icon_background'),
            metadata=agent.get('metadata', {}),
            usage_examples=usage_examples or []
        )
        
        await self._save_template(template)
        
        logger.debug(f"Created template {template.template_id} from agent {agent_id}")
        return template.template_id
    
    async def get_template(self, template_id: str) -> Optional[AgentTemplate]:
        try:
            logger.debug(f"Querying database for template_id: {template_id}")
            data = await self._templates.get("template_id", template_id)

            logger.debug(f"Database query result for {template_id}: {data is not None}")

            if not data:
                logger.debug(f"No template found with ID: {template_id}")
                return None

            creator_id = data['creator_id']
            logger.debug(f"Template {template_id} found, creator_id: {creator_id}")

            try:
                account = await execute_one(
                    'SELECT id, name, slug FROM basejump.accounts WHERE id = :id',
                    {"id": creator_id}
                )

                creator_name = None
                if account:
                    creator_name = account.get('name') or account.get('slug')

                data['creator_name'] = creator_name
                logger.debug(f"Creator name resolved for {template_id}: {creator_name}")

            except Exception as e:
                logger.warning(f"Failed to get creator name for template {template_id}: {e}")
                data['creator_name'] = None

            return self._map_to_template(data)

        except Exception as e:
            try:
                error_str = str(e)
            except Exception:
                error_str = f"Error of type {type(e).__name__}"
            logger.error(f"Error in get_template for {template_id}: {error_str}")
            raise
    
    async def get_user_templates(self, creator_id: str) -> List[AgentTemplate]:
        rows = await self._templates.list(
            filters={"creator_id": creator_id},
            order_by="created_at DESC",
            limit=1000
        )

        if not rows:
            return []

        account = await execute_one(
            'SELECT id, name, slug FROM basejump.accounts WHERE id = :id',
            {"id": creator_id}
        )

        creator_name = None
        if account:
            creator_name = account.get('name') or account.get('slug')

        templates = []
        for template_data in rows:
            template_data['creator_name'] = creator_name
            templates.append(self._map_to_template(template_data))

        return templates
    
    async def get_public_templates(
        self,
        is_recoder_team: Optional[bool] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[AgentTemplate]:
        conditions = ['"is_public" = TRUE']
        params: Dict[str, Any] = {}

        if is_recoder_team is not None:
            conditions.append('"is_recoder_team" = :is_recoder_team')
            params["is_recoder_team"] = is_recoder_team

        if search:
            conditions.append('"name" ILIKE :search')
            params["search"] = f"%{search}%"

        if tags:
            for i, tag in enumerate(tags):
                conditions.append(f'"tags" @> :tag_{i}::jsonb')
                params[f"tag_{i}"] = json.dumps([tag])

        where = " AND ".join(conditions)
        sql = f'SELECT * FROM "agent_templates" WHERE {where} ORDER BY "download_count" DESC, "marketplace_published_at" DESC'

        if limit:
            sql += " LIMIT :limit"
            params["limit"] = limit
        if offset:
            sql += " OFFSET :offset"
            params["offset"] = offset

        rows = await execute_read(sql, params)

        if not rows:
            return []

        creator_ids = list(set(row['creator_id'] for row in rows))

        # Batch-fetch creator names
        if creator_ids:
            placeholders = ", ".join(f":cid_{i}" for i in range(len(creator_ids)))
            cid_params = {f"cid_{i}": cid for i, cid in enumerate(creator_ids)}
            accounts = await execute_read(
                f'SELECT id, name, slug FROM basejump.accounts WHERE id IN ({placeholders})',
                cid_params
            )
        else:
            accounts = []

        creator_names = {}
        for account in accounts:
            creator_names[account['id']] = account.get('name') or account.get('slug')

        templates = []
        for template_data in rows:
            creator_name = creator_names.get(template_data['creator_id'])
            template_data['creator_name'] = creator_name
            templates.append(self._map_to_template(template_data))

        return templates
    
    async def publish_template(
        self,
        template_id: str,
        creator_id: str,
        usage_examples: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        logger.debug(f"Publishing template {template_id}")

        set_parts = [
            '"is_public" = TRUE',
            '"marketplace_published_at" = :published_at',
            '"updated_at" = :updated_at',
        ]
        params: Dict[str, Any] = {
            "published_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "template_id": template_id,
            "creator_id": creator_id,
        }

        if usage_examples is not None:
            set_parts.append('"usage_examples" = :usage_examples::jsonb')
            params["usage_examples"] = json.dumps(usage_examples)

        set_clause = ", ".join(set_parts)
        rows = await execute_mutate(
            f'UPDATE "agent_templates" SET {set_clause} '
            f'WHERE "template_id" = :template_id AND "creator_id" = :creator_id '
            f'RETURNING "template_id"',
            params
        )

        success = len(rows) > 0
        if success:
            logger.debug(f"Published template {template_id}")

        return success
    
    async def unpublish_template(self, template_id: str, creator_id: str) -> bool:
        logger.debug(f"Unpublishing template {template_id}")

        rows = await execute_mutate(
            'UPDATE "agent_templates" SET "is_public" = FALSE, '
            '"marketplace_published_at" = NULL, '
            '"updated_at" = :updated_at '
            'WHERE "template_id" = :template_id AND "creator_id" = :creator_id '
            'RETURNING "template_id"',
            {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "template_id": template_id,
                "creator_id": creator_id,
            }
        )

        success = len(rows) > 0
        if success:
            logger.debug(f"Unpublished template {template_id}")

        return success
    
    async def delete_template(self, template_id: str, creator_id: str) -> bool:
        """Delete a template. Only the creator can delete their templates."""
        logger.debug(f"Deleting template {template_id} for user {creator_id}")

        # First check if template exists and user owns it
        template = await self._templates.get("template_id", template_id)

        if not template:
            logger.warning(f"Template {template_id} not found")
            return False

        if template['creator_id'] != creator_id:
            logger.warning(f"User {creator_id} cannot delete template {template_id} (owned by {template['creator_id']})")
            return False

        # Delete the template (with both conditions for safety)
        rows = await execute_mutate(
            'DELETE FROM "agent_templates" WHERE "template_id" = :template_id AND "creator_id" = :creator_id '
            'RETURNING "template_id"',
            {"template_id": template_id, "creator_id": creator_id}
        )

        success = len(rows) > 0
        if success:
            logger.debug(f"Successfully deleted template {template_id}")

        return success
    
    async def increment_download_count(self, template_id: str) -> None:
        await execute_mutate(
            "SELECT increment_template_download_count(:template_id_param)",
            {"template_id_param": template_id}
        )
    
    async def validate_access(self, template: AgentTemplate, user_id: str) -> None:
        if template.creator_id != user_id and not template.is_public:
            raise TemplateAccessDeniedError("Access denied to template")
    
    async def _get_agent_by_id(self, agent_id: str) -> Optional[Dict[str, Any]]:
        return await self._agents.get("agent_id", agent_id)
    
    async def _get_agent_version_config(self, agent: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        version_id = agent.get('current_version_id')
        if version_id:
            row = await self._agent_versions.get("version_id", version_id, cols="config")

            if row and row.get('config'):
                return row['config']

        return {}
    
    async def _sanitize_config_for_template(self, config: Dict[str, Any]) -> Dict[str, Any]:
        return self._fallback_sanitize_config(config)
    
    def _fallback_sanitize_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        agentpress_tools = config.get('tools', {}).get('agentpress', {})
        sanitized_agentpress = {}
        
        for tool_name, tool_config in agentpress_tools.items():
            if isinstance(tool_config, dict):
                sanitized_agentpress[tool_name] = tool_config.get('enabled', False)
            elif isinstance(tool_config, bool):
                sanitized_agentpress[tool_name] = tool_config
            else:
                sanitized_agentpress[tool_name] = False
        
        triggers = config.get('triggers', [])
        sanitized_triggers = []
        for trigger in triggers:
            if isinstance(trigger, dict):
                trigger_config = trigger.get('config', {})
                provider_id = trigger_config.get('provider_id', '')
                
                agent_prompt = trigger_config.get('agent_prompt', '')
                
                sanitized_config = {
                    'provider_id': provider_id,
                    'agent_prompt': agent_prompt,
                }
                
                # Extract trigger variables if they exist in the prompt
                trigger_variables = trigger_config.get('trigger_variables', [])
                if not trigger_variables and agent_prompt:
                    # Extract variables from the prompt using regex
                    pattern = r'\{\{(\w+)\}\}'
                    matches = re.findall(pattern, agent_prompt)
                    if matches:
                        trigger_variables = list(set(matches))
                
                if trigger_variables:
                    sanitized_config['trigger_variables'] = trigger_variables
                
                if provider_id == 'schedule':
                    sanitized_config['cron_expression'] = trigger_config.get('cron_expression', '')
                    sanitized_config['timezone'] = trigger_config.get('timezone', 'UTC')
                elif provider_id == 'composio':
                    sanitized_config['trigger_slug'] = trigger_config.get('trigger_slug', '')
                    if 'qualified_name' in trigger_config:
                        sanitized_config['qualified_name'] = trigger_config['qualified_name']
                    
                    excluded_fields = {
                        'profile_id', 'composio_trigger_id', 'provider_id', 
                        'agent_prompt', 'trigger_slug', 'qualified_name', 'trigger_variables'
                    }
                    
                    trigger_fields = {}
                    for key, value in trigger_config.items():
                        if key not in excluded_fields:
                            if isinstance(value, bool):
                                trigger_fields[key] = {'type': 'boolean', 'required': True}
                            elif isinstance(value, (int, float)):
                                trigger_fields[key] = {'type': 'number', 'required': True}
                            elif isinstance(value, list):
                                trigger_fields[key] = {'type': 'array', 'required': True}
                            elif isinstance(value, dict):
                                trigger_fields[key] = {'type': 'object', 'required': True}
                            else:
                                trigger_fields[key] = {'type': 'string', 'required': True}
                    
                    if trigger_fields:
                        sanitized_config['trigger_fields'] = trigger_fields

                sanitized_trigger = {
                    'name': trigger.get('name'),
                    'description': trigger.get('description'),
                    'trigger_type': trigger.get('trigger_type'),
                    'is_active': trigger.get('is_active', True),
                    'config': sanitized_config
                }
                sanitized_triggers.append(sanitized_trigger)
        
        sanitized = {
            'system_prompt': config.get('system_prompt', ''),
            'model': config.get('model'),
            'tools': {
                'agentpress': sanitized_agentpress,
                'mcp': config.get('tools', {}).get('mcp', []),
                'custom_mcp': []
            },
            'triggers': sanitized_triggers,
            'metadata': {}
        }
        
        custom_mcps = config.get('tools', {}).get('custom_mcp', [])
        for mcp in custom_mcps:
            if isinstance(mcp, dict):
                mcp_name = mcp.get('name', '')
                mcp_type = mcp.get('type', 'sse')
                
                sanitized_mcp = {
                    'name': mcp_name,
                    'type': mcp_type,
                    'display_name': mcp.get('display_name') or mcp_name,
                    'enabledTools': mcp.get('enabledTools', [])
                }
                
                if mcp_type == 'composio':
                    original_config = mcp.get('config', {})
                    qualified_name = (
                        mcp.get('mcp_qualified_name') or 
                        original_config.get('mcp_qualified_name') or
                        mcp.get('qualifiedName') or
                        original_config.get('qualifiedName')
                    )
                    toolkit_slug = (
                        mcp.get('toolkit_slug') or 
                        original_config.get('toolkit_slug')
                    )
                    
                    if not qualified_name:
                        if not toolkit_slug:
                            toolkit_slug = mcp_name.lower().replace(' ', '_')
                        qualified_name = f"composio.{toolkit_slug}"
                    else:
                        if not toolkit_slug:
                            if qualified_name.startswith('composio.'):
                                toolkit_slug = qualified_name[9:]
                            else:
                                toolkit_slug = mcp_name.lower().replace(' ', '_')
                    
                    sanitized_mcp['mcp_qualified_name'] = qualified_name
                    sanitized_mcp['toolkit_slug'] = toolkit_slug
                    sanitized_mcp['config'] = {}
                
                else:
                    qualified_name = mcp.get('qualifiedName')
                    if not qualified_name:
                        safe_name = mcp_name.replace(' ', '_').lower()
                        qualified_name = f"custom_{mcp_type}_{safe_name}"
                    
                    sanitized_mcp['qualifiedName'] = qualified_name
                    sanitized_mcp['config'] = {}
                
                sanitized['tools']['custom_mcp'].append(sanitized_mcp)
        
        return sanitized
    
    def _is_recoder_default_agent(self, agent: Dict[str, Any]) -> bool:
        metadata = agent.get('metadata', {})
        return metadata.get('is_recoder_default', False)
    
    async def _save_template(self, template: AgentTemplate) -> None:
        template_data = {
            'template_id': template.template_id,
            'creator_id': template.creator_id,
            'name': template.name,
            'config': template.config,
            'tags': template.tags,
            'categories': template.categories,
            'is_public': template.is_public,
            'marketplace_published_at': template.marketplace_published_at.isoformat() if template.marketplace_published_at else None,
            'download_count': template.download_count,
            'created_at': template.created_at.isoformat(),
            'updated_at': template.updated_at.isoformat(),
            'icon_name': template.icon_name,
            'icon_color': template.icon_color,
            'icon_background': template.icon_background,
            'metadata': template.metadata,
            'usage_examples': template.usage_examples
        }

        await self._templates.insert(template_data)
    
    @staticmethod
    def _parse_dt(value) -> Optional[datetime]:
        """Parse a datetime value that may be a datetime object or ISO string."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))

    def _map_to_template(self, data: Dict[str, Any]) -> AgentTemplate:
        creator_name = data.get('creator_name')

        usage_examples = data.get('usage_examples', [])
        logger.debug(f"Mapping template {data.get('template_id')}: usage_examples from DB = {usage_examples}")
        logger.debug(f"Raw data keys: {list(data.keys())}")

        return AgentTemplate(
            template_id=str(data['template_id']),
            creator_id=str(data['creator_id']),
            name=data['name'],
            config=data.get('config', {}),
            tags=data.get('tags', []),
            categories=data.get('categories', []),
            is_public=data.get('is_public', False),
            is_recoder_team=data.get('is_recoder_team', False),
            marketplace_published_at=self._parse_dt(data.get('marketplace_published_at')),
            download_count=data.get('download_count', 0),
            created_at=self._parse_dt(data['created_at']),
            updated_at=self._parse_dt(data['updated_at']),
            icon_name=data.get('icon_name'),
            icon_color=data.get('icon_color'),
            icon_background=data.get('icon_background'),
            metadata=data.get('metadata', {}),
            creator_name=creator_name,
            usage_examples=usage_examples
        )

    # Share link functionality removed - now using direct template ID URLs for simplicity

def get_template_service() -> TemplateService:
    return TemplateService()