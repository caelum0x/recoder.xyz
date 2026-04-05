from __future__ import annotations

import asyncio
import os
from typing import Awaitable, Callable, List, Optional, Tuple

from core.utils.logger import logger

FileUploadData = Tuple[str, bytes, str, Optional[str]]

CreateProjectFn = Callable[[str, str, str], Awaitable[None]]
GetProjectFn = Callable[[str], Awaitable[object | None]]
ResolveSandboxFn = Callable[[str, str, object | None, bool], Awaitable[object | None]]
UploadFilesFn = Callable[[str, str, List[FileUploadData], Optional[str]], Awaitable[None]]
CreateTaskFn = Callable[[Awaitable[None]], asyncio.Task]

DEFAULT_SYNC_SANDBOX_TIMEOUT_SECONDS = float(
    os.getenv('AGENT_START_SYNC_SANDBOX_TIMEOUT_SECONDS', '8')
)
DEFAULT_SYNC_UPLOAD_TIMEOUT_SECONDS = float(
    os.getenv('AGENT_START_SYNC_UPLOAD_TIMEOUT_SECONDS', '5')
)


async def prepare_uploaded_files_for_agent_start(
    *,
    project_id: str,
    thread_id: str,
    prompt: str,
    account_id: str,
    is_new_thread: bool,
    files_data: List[FileUploadData],
    create_project_fn: CreateProjectFn,
    get_project_fn: GetProjectFn,
    resolve_sandbox_fn: ResolveSandboxFn,
    upload_files_fn: UploadFilesFn,
    create_task_fn: CreateTaskFn = asyncio.create_task,
    sync_sandbox_timeout_seconds: float = DEFAULT_SYNC_SANDBOX_TIMEOUT_SECONDS,
    sync_upload_timeout_seconds: float = DEFAULT_SYNC_UPLOAD_TIMEOUT_SECONDS,
) -> Optional[str]:
    if not files_data:
        return None

    placeholder_name = f"{prompt[:30]}..." if len(prompt) > 30 else prompt if prompt else 'Untitled'

    if is_new_thread:
        try:
            await create_project_fn(project_id, account_id, placeholder_name)
        except Exception as error:
            logger.debug(f'Project creation skipped (may already exist): {error}')
    else:
        try:
            existing_project = await get_project_fn(project_id)
            if not existing_project:
                await create_project_fn(project_id, account_id, placeholder_name)
        except Exception as error:
            logger.debug(f'Project check/creation skipped: {error}')

    async def background_upload() -> None:
        try:
            sandbox_info = await resolve_sandbox_fn(project_id, account_id, None, True)
            sandbox_id = getattr(sandbox_info, 'sandbox_id', None) if sandbox_info else None
            if sandbox_id:
                await upload_files_fn(project_id, thread_id, files_data, account_id)
                logger.info(
                    f'✅ [BACKGROUND] Uploaded {len(files_data)} files to sandbox {sandbox_id}'
                )
            else:
                logger.warning(
                    f'⚠️ [BACKGROUND] Failed to resolve sandbox for file uploads (project {project_id})'
                )
        except Exception as error:
            logger.error(f'❌ [BACKGROUND] File upload failed for project {project_id}: {error}')

    try:
        sandbox_info = await asyncio.wait_for(
            resolve_sandbox_fn(project_id, account_id, None, True),
            timeout=sync_sandbox_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning(
            f'⏱️ [AGENT_START] Sandbox creation timed out ({sync_sandbox_timeout_seconds}s) '
            f'for project {project_id}, moving file upload to background'
        )
        create_task_fn(background_upload())
        return None

    sandbox_id = getattr(sandbox_info, 'sandbox_id', None) if sandbox_info else None
    if not sandbox_id:
        logger.warning(
            f'⚠️ [AGENT_START] Failed to resolve sandbox for file uploads (project {project_id})'
        )
        create_task_fn(background_upload())
        return None

    logger.info(
        f'✅ [AGENT_START] Resolved sandbox {sandbox_id} for file uploads (project {project_id})'
    )

    try:
        await asyncio.wait_for(
            upload_files_fn(project_id, thread_id, files_data, account_id),
            timeout=sync_upload_timeout_seconds,
        )
        logger.info(f'✅ [AGENT_START] Uploaded {len(files_data)} files to sandbox {sandbox_id}')
        return sandbox_id
    except asyncio.TimeoutError:
        logger.warning(
            f'⏱️ [AGENT_START] File upload timed out ({sync_upload_timeout_seconds}s) '
            f'for project {project_id}, continuing in background'
        )
    except Exception as error:
        logger.warning(
            f'⚠️ [AGENT_START] File upload failed for project {project_id}: {error}. '
            'Continuing in background.'
        )

    create_task_fn(background_upload())
    return sandbox_id
