import structlog
from typing import Optional
from core.agentpress.tool import Tool, tool_metadata
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.services.db import Table, execute_one

@tool_metadata(
    display_name="Agent Builder Base",
    description="Base tool for agent building functionality",
    icon="Wrench",
    color="bg-gray-100 dark:bg-gray-800/50",
    weight=900,
    visible=False
)
class AgentBuilderBaseTool(Tool):
    def __init__(self, thread_manager: ThreadManager, agent_id: str):
        super().__init__()
        self.thread_manager = thread_manager
        self.agent_id = agent_id

    async def _get_current_account_id(self) -> str:
        """Get account_id from current thread context."""
        context_vars = structlog.contextvars.get_contextvars()
        thread_id = context_vars.get('thread_id')

        if not thread_id:
            raise ValueError("No thread_id available from execution context")

        result = await execute_one(
            "SELECT account_id FROM threads WHERE thread_id::text = :thread_id LIMIT 1",
            {"thread_id": thread_id}
        )

        if not result:
            raise ValueError(f"Could not find thread with ID: {thread_id}")

        account_id = result.get('account_id')
        if not account_id:
            raise ValueError("Thread has no associated account_id")

        return account_id

    async def _get_agent_data(self) -> Optional[dict]:
        try:
            return await Table("agents").get("agent_id", self.agent_id)
        except Exception as e:
            logger.error(f"Error getting agent data: {e}")
            return None