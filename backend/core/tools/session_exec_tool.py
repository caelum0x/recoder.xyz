"""Stateful Session Execution tool for Recoder agents — run commands in a persistent
terminal session where environment, working directory, and shell variables persist
across calls (like an interactive terminal).
"""

import asyncio
import json
import os
import time
from typing import Optional
from uuid import uuid4

import httpx

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.sandbox.sandbox import create_session_with_recovery
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.utils.config import config

MAX_OUTPUT_LENGTH = 10_000
_SESSION_KEY = "__daytona_session_id__"
AUTO_SESSION_IDLE_TTL_SECONDS = 300


def _truncate(text: str, max_len: int = MAX_OUTPUT_LENGTH) -> str:
    if len(text) <= max_len:
        return text
    half = max_len // 2
    return text[:half] + f"\n\n... [output truncated: {len(text)} chars total] ...\n\n" + text[-half:]


def _daytona_headers() -> dict:
    return {
        "Authorization": f"Bearer {config.DAYTONA_API_KEY}",
        "Content-Type": "application/json",
    }


def _daytona_url(sandbox_id: str, path: str) -> str:
    base = (config.DAYTONA_SERVER_URL or "http://localhost:3900/api").rstrip("/")
    return f"{base}/sandbox/{sandbox_id}/toolbox/{path}"


@tool_metadata(
    display_name="StatefulSession",
    description="Run shell commands in a persistent terminal session where variables, working directory, and environment persist across calls",
    icon="Terminal",
    color="bg-green-100 dark:bg-green-800/50",
    weight=26,
    visible=True,
    usage_guide="""
## StatefulSession — Persistent terminal sessions in the sandbox

Run shell commands in a stateful terminal session where shell state persists between
calls: working directory, environment variables, shell functions, and installed tools
all remain available.

### Available Actions

- **session_start** — Create a new persistent session. Returns a `session_id`.
- **session_exec** — Run a command in an existing session (auto-creates one if none exists).
- **session_destroy** — Clean up and delete a session when done.

### session_start

```
session_start()
```

Creates a new session and returns the `session_id`. You can use this `session_id`
in subsequent `session_exec` calls. The session persists until `session_destroy` is
called or the sandbox is stopped.

### session_exec

```
session_exec(command="cd /app && ls")
session_exec(command="npm install", session_id="my-session-123", timeout=120)
session_exec(command="echo $MY_VAR")
```

- If `session_id` is omitted, the tool reuses the last session or auto-creates one.
- State from previous commands persists: `cd /app` then `pwd` returns `/app`.
- `timeout`: seconds to wait for output (default 30, max 300).

### session_destroy

```
session_destroy(session_id="my-session-123")
```

Terminates and removes the session. Good practice to call at end of task.

### Typical workflow

```
# 1. Start a session
session_start()  → session_id="sess-abc123"

# 2. Set up environment (all persist)
session_exec("cd /workspace/myapp", session_id="sess-abc123")
session_exec("export NODE_ENV=test", session_id="sess-abc123")
session_exec("npm install", session_id="sess-abc123", timeout=120)

# 3. Run tests in same env
session_exec("npm test", session_id="sess-abc123", timeout=60)

# 4. Cleanup
session_destroy(session_id="sess-abc123")
```

### Notes
- Use `session_exec` with `session_id` omitted to let the tool manage the session lifecycle.
- For fire-and-forget commands with no state requirements, use `execute_command` in CodeInterpreter instead.
- Long-running commands: set a generous `timeout` or run with `nohup` / `tmux`.
""",
)
class SandboxSessionExecTool(SandboxToolsBase):
    """Run shell commands in a persistent Daytona process session."""

    def __init__(self, project_id: str, thread_manager: Optional[ThreadManager] = None):
        super().__init__(project_id, thread_manager)
        # Per-instance fallback session id (when no explicit session_id given)
        self._auto_session_id: Optional[str] = None
        self._auto_session_last_used_at: Optional[float] = None

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    async def _create_session(self, session_id: str) -> None:
        """Create a Daytona process session with ENOSPC recovery."""
        await self._ensure_sandbox()
        await create_session_with_recovery(self.sandbox, session_id)
        logger.debug(f"[StatefulSession] Created session {session_id} in sandbox {self.sandbox_id}")

    async def _exec_in_session(
        self,
        session_id: str,
        command: str,
        timeout: int = 30,
    ) -> dict:
        """Execute a command in an existing session and return the output."""
        exec_url = _daytona_url(self.sandbox_id, f"process/session/{session_id}/exec")
        cmd_id = str(uuid4())

        payload = {
            "command": command,
            "cmdId": cmd_id,
            "async": False,
            "timeout": timeout,
        }
        async with httpx.AsyncClient(timeout=float(timeout + 15)) as client:
            resp = await client.post(exec_url, json=payload, headers=_daytona_headers())
            resp.raise_for_status()
            data = resp.json()

        # Try to fetch structured logs; fall back to inline result
        output = data.get("output") or data.get("result") or ""
        exit_code = data.get("exitCode") if data.get("exitCode") is not None else 0

        # If the API only acknowledges (async path), poll for logs
        if not output and data.get("cmdId"):
            logs_url = _daytona_url(
                self.sandbox_id,
                f"process/session/{session_id}/command/{data['cmdId']}/logs",
            )
            try:
                async with httpx.AsyncClient(timeout=float(timeout + 15)) as client:
                    logs_resp = await client.get(logs_url, headers=_daytona_headers())
                    if logs_resp.status_code == 200:
                        logs_data = logs_resp.json()
                        output = logs_data.get("output") or logs_data.get("logs") or ""
                        if logs_data.get("exitCode") is not None:
                            exit_code = logs_data["exitCode"]
            except Exception as log_exc:
                logger.debug(f"[StatefulSession] Could not fetch command logs: {log_exc}")

        return {"output": output, "exit_code": exit_code, "cmd_id": cmd_id}

    async def _delete_session(self, session_id: str) -> None:
        """Delete a Daytona process session via REST API."""
        url = _daytona_url(self.sandbox_id, f"process/session/{session_id}")
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.delete(url, headers=_daytona_headers())
            # 404 is fine — session may have already ended
            if resp.status_code not in (200, 204, 404):
                resp.raise_for_status()
        logger.debug(f"[StatefulSession] Deleted session {session_id}")

    async def _ensure_auto_session(self) -> str:
        """Get or create the per-invocation auto-managed session."""
        now = time.time()
        if (
            self._auto_session_id
            and self._auto_session_last_used_at is not None
            and (now - self._auto_session_last_used_at) > AUTO_SESSION_IDLE_TTL_SECONDS
        ):
            try:
                await self._delete_session(self._auto_session_id)
                logger.info(
                    "[StatefulSession] Expired idle auto session %s after %.0fs",
                    self._auto_session_id,
                    now - self._auto_session_last_used_at,
                )
            except Exception as exc:
                logger.debug(f"[StatefulSession] Failed to delete expired auto session: {exc}")
            finally:
                self._auto_session_id = None
                self._auto_session_last_used_at = None

        if not self._auto_session_id:
            self._auto_session_id = f"auto-{str(uuid4())[:8]}"
            await self._create_session(self._auto_session_id)
        self._auto_session_last_used_at = now
        return self._auto_session_id

    # ------------------------------------------------------------------ #
    #  session_start                                                        #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "session_start",
                "description": (
                    "Create a new persistent terminal session in the sandbox. "
                    "Returns a session_id that you pass to session_exec. "
                    "The session keeps working directory, environment variables, and shell state "
                    "between commands."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": (
                                "Optional custom identifier for the session. "
                                "If omitted a unique ID is generated automatically."
                            ),
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def session_start(self, session_id: Optional[str] = None) -> ToolResult:
        """Create a new persistent process session in the Daytona sandbox."""
        try:
            await self._ensure_sandbox()

            sid = session_id or f"sess-{str(uuid4())[:12]}"
            await self._create_session(sid)

            return self.success_response(
                {
                    "session_id": sid,
                    "message": f"Session '{sid}' created. Pass this session_id to session_exec.",
                }
            )
        except httpx.HTTPStatusError as exc:
            logger.error(f"[StatefulSession] session_start HTTP error: {exc}", exc_info=True)
            return self.fail_response(f"Failed to create session (HTTP {exc.response.status_code}): {exc.response.text}")
        except Exception as exc:
            logger.error(f"[StatefulSession] session_start error: {exc}", exc_info=True)
            return self.fail_response(f"Error creating session: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  session_exec                                                         #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "session_exec",
                "description": (
                    "Execute a shell command inside a persistent session. "
                    "Shell state (working directory, environment variables, defined functions) "
                    "persists between calls with the same session_id.\n\n"
                    "If session_id is omitted the tool auto-creates and reuses an internal session."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "Shell command to run.",
                        },
                        "session_id": {
                            "type": "string",
                            "description": (
                                "Session ID from session_start. "
                                "Omit to use the auto-managed session."
                            ),
                        },
                        "timeout": {
                            "type": "integer",
                            "description": "Seconds to wait for command output (default 30, max 300).",
                            "default": 30,
                        },
                    },
                    "required": ["command"],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def session_exec(
        self,
        command: str,
        session_id: Optional[str] = None,
        timeout: int = 30,
    ) -> ToolResult:
        """Execute a command in a persistent Daytona session."""
        try:
            await self._ensure_sandbox()
            timeout = min(max(int(timeout), 1), 300)

            sid = session_id or await self._ensure_auto_session()

            result = await self._exec_in_session(sid, command, timeout)
            if sid == self._auto_session_id:
                self._auto_session_last_used_at = time.time()

            return self.success_response(
                {
                    "output": _truncate(result["output"]),
                    "exit_code": result["exit_code"],
                    "command": command,
                    "session_id": sid,
                }
            )

        except asyncio.TimeoutError:
            return self.fail_response(f"Session command timed out after {timeout}s.")
        except httpx.HTTPStatusError as exc:
            logger.error(f"[StatefulSession] session_exec HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"Session exec failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[StatefulSession] session_exec error: {exc}", exc_info=True)
            return self.fail_response(f"Error executing session command: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  session_destroy                                                      #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "session_destroy",
                "description": (
                    "Destroy a persistent session when it is no longer needed. "
                    "Frees resources in the sandbox."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": (
                                "Session ID to destroy. "
                                "If omitted, destroys the auto-managed internal session (if any)."
                            ),
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def session_destroy(self, session_id: Optional[str] = None) -> ToolResult:
        """Destroy a Daytona process session."""
        try:
            await self._ensure_sandbox()

            sid = session_id or self._auto_session_id
            if not sid:
                return self.fail_response(
                    "No session_id provided and no auto-managed session exists."
                )

            await self._delete_session(sid)

            if sid == self._auto_session_id:
                self._auto_session_id = None
                self._auto_session_last_used_at = None

            return self.success_response(
                {"session_id": sid, "message": f"Session '{sid}' destroyed."}
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[StatefulSession] session_destroy HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"Failed to destroy session (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[StatefulSession] session_destroy error: {exc}", exc_info=True)
            return self.fail_response(f"Error destroying session: {str(exc)}")
