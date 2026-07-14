"""Recursion (spawn-depth) guard tests for clink agents.

These assert that a clink chain such as Claude -> clink -> Codex -> clink ->
Claude cannot recurse without bound:

(a) spawning is refused once PAL_CLINK_DEPTH reaches the cap, and
(b) the child subprocess env increments the counter by one.

The subprocess is mocked so no real CLI is launched.
"""

import asyncio
import shutil
from pathlib import Path

import pytest

from clink.agents.base import CLINK_DEPTH_ENV, CLINK_MAX_DEPTH, BaseCLIAgent, CLIAgentError
from clink.models import ResolvedCLIClient, ResolvedCLIRole


class DummyProcess:
    def __init__(self, *, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode

    async def communicate(self, _input):
        return self._stdout, self._stderr


@pytest.fixture()
def claude_agent():
    prompt_path = Path("systemprompts/clink/default.txt").resolve()
    role = ResolvedCLIRole(name="default", prompt_path=prompt_path, role_args=[])
    client = ResolvedCLIClient(
        name="claude",
        executable=["claude"],
        internal_args=["--print", "--output-format", "json"],
        config_args=[],
        env={},
        timeout_seconds=30,
        parser="claude_json",
        roles={"default": role},
        output_to_file=None,
        working_dir=None,
    )
    return BaseCLIAgent(client), role


def _patch_which(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda executable_name: f"/usr/bin/{executable_name}")


@pytest.mark.asyncio
async def test_spawn_refused_when_depth_at_cap(monkeypatch, claude_agent):
    """(a) When PAL_CLINK_DEPTH is already at/above the cap, refuse to spawn."""
    agent, role = claude_agent
    _patch_which(monkeypatch)
    monkeypatch.setenv(CLINK_DEPTH_ENV, str(CLINK_MAX_DEPTH))

    spawned = False

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        nonlocal spawned
        spawned = True
        return DummyProcess()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    with pytest.raises(CLIAgentError) as exc_info:
        await agent.run(role=role, prompt="hi", files=[], images=[])

    assert CLINK_DEPTH_ENV in str(exc_info.value)
    assert spawned is False, "subprocess must not be launched when depth cap is reached"


@pytest.mark.asyncio
async def test_child_env_increments_depth(monkeypatch, claude_agent):
    """(b) The child subprocess env increments the depth counter by one."""
    agent, role = claude_agent
    _patch_which(monkeypatch)
    # Start below the cap so the spawn is allowed.
    monkeypatch.setenv(CLINK_DEPTH_ENV, "0")

    captured_env = {}

    async def fake_create_subprocess_exec(*_args, **kwargs):
        captured_env.update(kwargs.get("env") or {})
        return DummyProcess(stdout=b'{"result": "ok"}', returncode=0)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    await agent.run(role=role, prompt="hi", files=[], images=[])

    assert captured_env.get(CLINK_DEPTH_ENV) == "1"


@pytest.mark.asyncio
async def test_child_env_increments_from_unset(monkeypatch, claude_agent):
    """When PAL_CLINK_DEPTH is unset it is treated as 0 and the child gets 1."""
    agent, role = claude_agent
    _patch_which(monkeypatch)
    monkeypatch.delenv(CLINK_DEPTH_ENV, raising=False)

    captured_env = {}

    async def fake_create_subprocess_exec(*_args, **kwargs):
        captured_env.update(kwargs.get("env") or {})
        return DummyProcess(stdout=b'{"result": "ok"}', returncode=0)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    await agent.run(role=role, prompt="hi", files=[], images=[])

    assert captured_env.get(CLINK_DEPTH_ENV) == "1"
