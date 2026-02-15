"""Categorization background job functions."""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from core.utils.logger import logger
from core.services.db import Table, execute_read


async def run_categorization(project_id: str) -> None:
    """Categorize project - runs as async background task."""
    from core.utils.init_helpers import initialize
    
    logger.info(f"🏷️ Categorizing project: {project_id}")
    
    await initialize()
    
    try:
        from core.categorization.service import categorize_from_messages

        threads_table = Table("threads")
        projects_table = Table("projects").json_columns("categories")
        messages_table = Table("messages")

        threads = await threads_table.list(filters={"project_id": project_id}, cols="thread_id", limit=1)
        if not threads:
            await projects_table.update("project_id", project_id, {'last_categorized_at': datetime.now(timezone.utc).isoformat()})
            return

        thread_id = threads[0]['thread_id']

        messages = await messages_table.list(filters={"thread_id": thread_id}, cols="type, content", order_by="created_at")

        user_count = sum(1 for m in messages if m.get('type') == 'user')
        if user_count < 1:
            await projects_table.update("project_id", project_id, {'last_categorized_at': datetime.now(timezone.utc).isoformat()})
            return

        categories = await categorize_from_messages(messages) or ["Other"]

        await projects_table.update("project_id", project_id, {
            'categories': categories,
            'last_categorized_at': datetime.now(timezone.utc).isoformat()
        })
        
        logger.info(f"✅ Categorized project {project_id}: {categories}")
        
    except Exception as e:
        logger.error(f"Categorization failed: {e}", exc_info=True)


async def run_stale_projects() -> None:
    """Process stale projects - runs as async background task."""
    from core.utils.init_helpers import initialize
    
    logger.info("🕐 Processing stale projects")
    
    await initialize()
    
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

        stale_projects = await execute_read(
            "SELECT * FROM get_stale_projects_for_categorization(:stale_threshold, :max_count)",
            {'stale_threshold': cutoff, 'max_count': 50}
        )

        for project in stale_projects:
            asyncio.create_task(run_categorization(project['project_id']))

        logger.info(f"✅ Queued {len(stale_projects)} stale projects")
        
    except Exception as e:
        logger.error(f"Stale projects processing failed: {e}", exc_info=True)


def start_categorization(project_id: str) -> None:
    """Start categorization as background task."""
    asyncio.create_task(run_categorization(project_id))
    logger.debug(f"Started categorization for project {project_id}")


def start_stale_projects() -> None:
    """Start stale projects processing as background task."""
    asyncio.create_task(run_stale_projects())
    logger.debug("Started stale projects processing")


async def categorize(project_id: str):
    """Start project categorization task."""
    start_categorization(project_id)


async def process_stale():
    """Start stale projects processing task."""
    start_stale_projects()


# Backwards-compatible wrappers with .send() interface
class _DispatchWrapper:
    def __init__(self, dispatch_fn):
        self._dispatch_fn = dispatch_fn
    
    def send(self, *args, **kwargs):
        import asyncio
        try:
            loop = asyncio.get_running_loop()
            asyncio.create_task(self._dispatch_fn(*args, **kwargs))
        except RuntimeError:
            asyncio.run(self._dispatch_fn(*args, **kwargs))
    
    def send_with_options(self, args=None, kwargs=None, delay=None):
        args = args or ()
        kwargs = kwargs or {}
        self.send(*args, **kwargs)


categorize_project = _DispatchWrapper(
    lambda project_id: start_categorization(project_id)
)

process_stale_projects = _DispatchWrapper(
    lambda: start_stale_projects()
)
