import asyncio
from types import SimpleNamespace

import pytest

from core.utils.agent_startup_files import prepare_uploaded_files_for_agent_start


@pytest.mark.asyncio
async def test_prepare_uploaded_files_times_out_sandbox_and_schedules_background_upload():
    scheduled: list[asyncio.Task] = []

    async def slow_resolve(*_args, **_kwargs):
        await asyncio.sleep(0.05)
        return SimpleNamespace(sandbox_id='sbx-late')

    async def fake_upload(*_args, **_kwargs):
        return None

    def create_task(coro):
        task = asyncio.create_task(coro)
        scheduled.append(task)
        return task

    sandbox_id = await prepare_uploaded_files_for_agent_start(
        project_id='project-1',
        thread_id='thread-1',
        prompt='hello',
        account_id='account-1',
        is_new_thread=True,
        files_data=[('demo.txt', b'hello', 'text/plain', 'hello')],
        create_project_fn=lambda *_args: asyncio.sleep(0),
        get_project_fn=lambda *_args: asyncio.sleep(0, result=None),
        resolve_sandbox_fn=slow_resolve,
        upload_files_fn=fake_upload,
        create_task_fn=create_task,
        sync_sandbox_timeout_seconds=0.01,
        sync_upload_timeout_seconds=0.01,
    )

    assert sandbox_id is None
    assert len(scheduled) == 1

    for task in scheduled:
        task.cancel()
    await asyncio.gather(*scheduled, return_exceptions=True)


@pytest.mark.asyncio
async def test_prepare_uploaded_files_returns_sandbox_id_and_backgrounds_slow_upload():
    scheduled: list[asyncio.Task] = []

    async def fast_resolve(*_args, **_kwargs):
        return SimpleNamespace(sandbox_id='sbx-fast')

    async def slow_upload(*_args, **_kwargs):
        await asyncio.sleep(0.05)

    def create_task(coro):
        task = asyncio.create_task(coro)
        scheduled.append(task)
        return task

    sandbox_id = await prepare_uploaded_files_for_agent_start(
        project_id='project-1',
        thread_id='thread-1',
        prompt='hello',
        account_id='account-1',
        is_new_thread=False,
        files_data=[('demo.txt', b'hello', 'text/plain', 'hello')],
        create_project_fn=lambda *_args: asyncio.sleep(0),
        get_project_fn=lambda *_args: asyncio.sleep(0, result={'project_id': 'project-1'}),
        resolve_sandbox_fn=fast_resolve,
        upload_files_fn=slow_upload,
        create_task_fn=create_task,
        sync_sandbox_timeout_seconds=0.01,
        sync_upload_timeout_seconds=0.01,
    )

    assert sandbox_id == 'sbx-fast'
    assert len(scheduled) == 1

    for task in scheduled:
        task.cancel()
    await asyncio.gather(*scheduled, return_exceptions=True)


@pytest.mark.asyncio
async def test_prepare_uploaded_files_finishes_inline_when_fast():
    scheduled: list[asyncio.Task] = []
    uploads: list[str] = []

    async def fast_resolve(*_args, **_kwargs):
        return SimpleNamespace(sandbox_id='sbx-fast')

    async def fast_upload(project_id, *_args, **_kwargs):
        uploads.append(project_id)

    def create_task(coro):
        task = asyncio.create_task(coro)
        scheduled.append(task)
        return task

    sandbox_id = await prepare_uploaded_files_for_agent_start(
        project_id='project-1',
        thread_id='thread-1',
        prompt='hello',
        account_id='account-1',
        is_new_thread=False,
        files_data=[('demo.txt', b'hello', 'text/plain', 'hello')],
        create_project_fn=lambda *_args: asyncio.sleep(0),
        get_project_fn=lambda *_args: asyncio.sleep(0, result={'project_id': 'project-1'}),
        resolve_sandbox_fn=fast_resolve,
        upload_files_fn=fast_upload,
        create_task_fn=create_task,
        sync_sandbox_timeout_seconds=0.01,
        sync_upload_timeout_seconds=0.01,
    )

    assert sandbox_id == 'sbx-fast'
    assert uploads == ['project-1']
    assert scheduled == []
