import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from core.tools.task_list_tool import Section, Task, TaskListTool, TaskStatus


@pytest.mark.asyncio
async def test_create_tasks_infers_single_existing_section(monkeypatch):
    tool = TaskListTool.__new__(TaskListTool)
    tool.thread_id = "thread-1"
    tool.task_list_message_type = "task_list"
    tool.workspace_path = "/workspace"
    existing_section = Section(id="section-1", title="React App")
    existing_task = Task(id="task-1", content="Initial", status=TaskStatus.PENDING, section_id="section-1")

    saved = {}

    async def fake_load_data():
        return [existing_section], [existing_task]

    async def fake_save_data(sections, tasks):
        saved["sections"] = sections
        saved["tasks"] = tasks

    tool._load_data = fake_load_data
    tool._save_data = fake_save_data

    result = await TaskListTool.create_tasks(tool, task_contents=["Run npm install"])

    assert result.success is True
    assert len(saved["tasks"]) == 2
    assert saved["tasks"][-1].content == "Run npm install"
    assert saved["tasks"][-1].section_id == "section-1"


@pytest.mark.asyncio
async def test_create_tasks_creates_default_section_when_none_exist():
    tool = TaskListTool.__new__(TaskListTool)
    tool.thread_id = "thread-1"
    tool.task_list_message_type = "task_list"
    tool.workspace_path = "/workspace"

    saved = {}

    async def fake_load_data():
        return [], []

    async def fake_save_data(sections, tasks):
        saved["sections"] = sections
        saved["tasks"] = tasks

    tool._load_data = fake_load_data
    tool._save_data = fake_save_data

    result = await TaskListTool.create_tasks(tool, task_contents=["Run npm install"])

    assert result.success is True
    assert len(saved["sections"]) == 1
    assert saved["sections"][0].title == "Tasks"
    assert len(saved["tasks"]) == 1
    assert saved["tasks"][0].section_id == saved["sections"][0].id
