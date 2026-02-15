import asyncio
from typing import Optional
from core.utils.logger import logger
from core.services.db import execute_one
from core.utils.recoder_default_agent_service import RecoderDefaultAgentService

_installation_cache = set()
_installation_in_progress = set()

async def ensure_recoder_installed(account_id: str) -> None:
    if account_id in _installation_cache:
        return
    
    if account_id in _installation_in_progress:
        return
    
    try:
        _installation_in_progress.add(account_id)

        existing = await execute_one(
            """
            SELECT agent_id
            FROM agents
            WHERE account_id = :account_id
              AND metadata->>'is_recoder_default' = 'true'
            LIMIT 1
            """,
            {"account_id": account_id},
        )

        if existing:
            _installation_cache.add(account_id)
            logger.debug(f"Recoder already installed for account {account_id}")
            return
        
        logger.info(f"Installing Recoder agent for account {account_id}")
        service = RecoderDefaultAgentService()
        agent_id = await service.install_recoder_agent_for_user(account_id, replace_existing=False)
        
        if agent_id:
            _installation_cache.add(account_id)
            logger.info(f"Successfully installed Recoder agent {agent_id} for account {account_id}")
        else:
            logger.warning(f"Failed to install Recoder agent for account {account_id}")
            
    except Exception as e:
        logger.error(f"Error ensuring Recoder installation for {account_id}: {e}")
    finally:
        _installation_in_progress.discard(account_id)


def trigger_recoder_installation(account_id: str) -> None:
    try:
        asyncio.create_task(ensure_recoder_installed(account_id))
    except RuntimeError:
        pass
