from typing import Dict, Any, Optional
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate
from datetime import datetime, timezone


class RecoderDefaultAgentService:
    """Simplified Recoder agent management service."""
    
    def __init__(self, db: Any = None):
        self._db = db
        logger.debug("🔄 RecoderDefaultAgentService initialized (simplified)")
    
    async def get_recoder_default_config(self) -> Dict[str, Any]:
        """Get the current Recoder configuration."""
        from core.config.recoder_config import SUNA_CONFIG
        return SUNA_CONFIG.copy()
    
    async def install_for_all_users(self) -> Dict[str, Any]:
        """Install Recoder agent for all users who don't have one."""
        logger.debug("🚀 Installing Recoder agents for users who don't have them")
        
        try:
            # Get all personal accounts
            accounts_rows = await execute(
                """
                SELECT id
                FROM basejump.accounts
                WHERE personal_account = true
                """
            )
            all_account_ids = {row['id'] for row in accounts_rows} if accounts_rows else set()

            # Get existing Recoder agents
            existing_rows = await execute(
                """
                SELECT account_id
                FROM agents
                WHERE metadata->>'is_recoder_default' = 'true'
                """
            )
            existing_account_ids = {row['account_id'] for row in existing_rows} if existing_rows else set()
            
            # Find accounts without Recoder
            missing_accounts = all_account_ids - existing_account_ids
            
            if not missing_accounts:
                return {
                    "installed_count": 0,
                    "failed_count": 0,
                    "details": ["All users already have Recoder agents"]
                }
            
            logger.debug(f"📦 Installing Recoder for {len(missing_accounts)} users")
            
            success_count = 0
            failed_count = 0
            errors = []
            
            for account_id in missing_accounts:
                try:
                    await self._create_recoder_agent_for_user(account_id)
                    success_count += 1
                    logger.debug(f"✅ Installed Recoder for user {account_id}")
                except Exception as e:
                    failed_count += 1
                    error_msg = f"Failed to install for user {account_id}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg)
            
            return {
                "installed_count": success_count,
                "failed_count": failed_count,
                "details": errors if errors else [f"Successfully installed for {success_count} users"]
            }
            
        except Exception as e:
            error_msg = f"Installation operation failed: {str(e)}"
            logger.error(error_msg)
            return {
                "installed_count": 0,
                "failed_count": 0,
                "details": [error_msg]
            }
    
    async def install_recoder_agent_for_user(self, account_id: str, replace_existing: bool = False) -> Optional[str]:
        """Install Recoder agent for a specific user."""
        logger.debug(f"🔄 Installing Recoder agent for user: {account_id}")
        
        try:
            # Check for existing Recoder agent
            existing_row = await execute_one(
                """
                SELECT agent_id
                FROM agents
                WHERE account_id::text = :account_id
                  AND metadata->>'is_recoder_default' = 'true'
                LIMIT 1
                """,
                {"account_id": account_id},
            )
            
            if existing_row:
                existing_agent_id = existing_row['agent_id']
                
                if replace_existing:
                    # Delete existing agent
                    await self._delete_agent(existing_agent_id)
                    logger.debug(f"Deleted existing Recoder agent for replacement")
                else:
                    logger.debug(f"User {account_id} already has Recoder agent: {existing_agent_id}")
                    return existing_agent_id

            # Create new agent
            agent_id = await self._create_recoder_agent_for_user(account_id)
            logger.debug(f"Successfully installed Recoder agent {agent_id} for user {account_id}")
            return agent_id
                
        except Exception as e:
            logger.error(f"Error in install_recoder_agent_for_user: {e}")
            return None
    
    async def get_recoder_agent_stats(self) -> Dict[str, Any]:
        """Get statistics about Recoder agents."""
        try:
            # Get total count
            total_row = await execute_one(
                """
                SELECT COUNT(*)::int AS total_count
                FROM agents
                WHERE metadata->>'is_recoder_default' = 'true'
                """
            )
            total_count = total_row.get("total_count", 0) if total_row else 0
            
            # Get creation dates for last 30 days
            from datetime import timedelta
            thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
            recent_row = await execute_one(
                """
                SELECT COUNT(*)::int AS recent_count
                FROM agents
                WHERE metadata->>'is_recoder_default' = 'true'
                  AND created_at >= :thirty_days_ago
                """,
                {"thirty_days_ago": thirty_days_ago},
            )
            recent_count = recent_row.get("recent_count", 0) if recent_row else 0
            
            return {
                "total_agents": total_count,
                "recent_installs": recent_count,
                "note": "Recoder agents always use current central configuration"
            }
            
        except Exception as e:
            logger.error(f"Failed to get agent stats: {e}")
            return {"error": str(e)}
    
    async def _create_recoder_agent_for_user(self, account_id: str) -> str:
        """Create a Recoder agent for a user."""
        from core.config.recoder_config import SUNA_CONFIG

        # Create agent record
        agent_data = {
            "account_id": account_id,
            "name": SUNA_CONFIG["name"],
            "description": SUNA_CONFIG["description"],
            "is_default": True,
            "icon_name": "sun",
            "icon_color": "#FFFFFF",
            "icon_background": "#000000",
            "metadata": {
                "is_recoder_default": True,
                "centrally_managed": True,
                "installation_date": datetime.now(timezone.utc).isoformat()
            },
            "version_count": 1
        }

        rows = await execute_mutate(
            """
            INSERT INTO agents (
                account_id, name, description, is_default,
                icon_name, icon_color, icon_background, metadata, version_count
            )
            VALUES (
                :account_id, :name, :description, :is_default,
                :icon_name, :icon_color, :icon_background, :metadata, :version_count
            )
            RETURNING agent_id
            """,
            agent_data,
        )

        if not rows:
            raise Exception("Failed to create agent record")

        agent_id = rows[0]['agent_id']
        
        # Create initial version
        await self._create_initial_version(agent_id, account_id)
        
        return agent_id
    
    async def _create_initial_version(self, agent_id: str, account_id: str) -> None:
        """Create initial version for Recoder agent.
        
        Note: We don't save system_prompt, model, or agentpress_tools for Recoder agents
        since they're always loaded from SUNA_CONFIG in memory. We only save MCPs
        which are user-specific customizations.
        """
        try:
            from core.versioning.version_service import get_version_service
            from core.config.recoder_config import SUNA_CONFIG
            
            version_service = await get_version_service()
            # For Recoder agents, only save MCPs (user customizations)
            # System prompt, model, and tools are always loaded from SUNA_CONFIG
            await version_service.create_version(
                agent_id=agent_id,
                user_id=account_id,
                system_prompt="",  # Not saved for Recoder - always from SUNA_CONFIG
                configured_mcps=SUNA_CONFIG["configured_mcps"],
                custom_mcps=SUNA_CONFIG["custom_mcps"],
                agentpress_tools={},  # Not saved for Recoder - always from SUNA_CONFIG
                model=None,  # Not saved for Recoder - always from SUNA_CONFIG
                version_name="v1",
                change_description="Initial Recoder agent installation"
            )
            
            logger.debug(f"Created initial version for Recoder agent {agent_id}")
            
        except Exception as e:
            logger.error(f"Failed to create initial version for Recoder agent {agent_id}: {e}")
            raise
    
    async def _delete_agent(self, agent_id: str) -> bool:
        """Delete an agent and clean up related data."""
        try:
            # Clean up triggers first
            try:
                from core.triggers.trigger_service import get_trigger_service
                trigger_service = get_trigger_service()
                
                trigger_rows = await execute(
                    """
                    SELECT trigger_id
                    FROM agent_triggers
                    WHERE agent_id::text = :agent_id
                    """,
                    {"agent_id": agent_id},
                )

                if trigger_rows:
                    for trigger_record in trigger_rows:
                        try:
                            await trigger_service.delete_trigger(trigger_record['trigger_id'])
                        except Exception as e:
                            logger.warning(f"Failed to clean up trigger: {str(e)}")
            except Exception as e:
                logger.warning(f"Failed to clean up triggers for agent {agent_id}: {str(e)}")
            
            # Delete agent
            deleted_rows = await execute_mutate(
                """
                DELETE FROM agents
                WHERE agent_id::text = :agent_id
                RETURNING agent_id
                """,
                {"agent_id": agent_id},
            )
            return bool(deleted_rows)
            
        except Exception as e:
            logger.error(f"Failed to delete agent {agent_id}: {e}")
            raise
