"""Code Interpreter tool — stateful code execution in Daytona sandboxes.

Supports Python, JavaScript, and TypeScript execution with persistent state.
Uses Daytona SDK's code_run() for single executions and sessions for stateful REPL.
"""

import json
from typing import Optional
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger


@tool_metadata(
    display_name="Code Interpreter",
    description="Execute Python, JavaScript, or TypeScript code in a secure sandbox with persistent state",
    icon="Terminal",
    color="bg-purple-100 dark:bg-purple-800/50",
    weight=25,
    visible=True,
    usage_guide="""
### Code Interpreter — Execute Code in Sandbox

**IMPORTANT: These are TOOL FUNCTIONS — invoke them as tool calls!**

**Available Functions:**
- `run_code` — Execute code and get output (stdout, stderr, exit code)
- `run_repl` — Execute code in a persistent REPL session (variables persist between calls)

**Supported Languages:** Python, JavaScript, TypeScript

**Usage Patterns:**

```
# Quick one-off execution
run_code(code="print('hello world')", language="python")

# Persistent REPL session (state persists)
run_repl(code="x = 42", session_name="analysis")
run_repl(code="print(x * 2)", session_name="analysis")  # prints 84

# Data analysis
run_code(code="import pandas as pd; df = pd.DataFrame({'a': [1,2,3]}); print(df.describe())")

# JavaScript execution
run_code(code="console.log(Array.from({length: 5}, (_, i) => i*i))", language="javascript")
```

**Notes:**
- Python has numpy, pandas, matplotlib pre-installed
- Matplotlib charts are automatically captured
- REPL sessions persist variables across calls (use same session_name)
- Timeout defaults to 30 seconds, max 300 seconds
"""
)
class SandboxCodeInterpreterTool(SandboxToolsBase):
    """Execute code in Daytona sandbox with stateful REPL support."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self._sessions = {}  # Track active REPL sessions

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "run_code",
            "description": "Execute code in a secure sandbox and return the output. Supports Python, JavaScript, and TypeScript. Each call is independent (no state persistence). For persistent state, use run_repl instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "**REQUIRED** — The code to execute."
                    },
                    "language": {
                        "type": "string",
                        "enum": ["python", "javascript", "typescript"],
                        "description": "**OPTIONAL** — Programming language. Default: python.",
                        "default": "python"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "**OPTIONAL** — Timeout in seconds (1-300). Default: 30.",
                        "default": 30
                    }
                },
                "required": ["code"],
                "additionalProperties": False
            }
        }
    })
    async def run_code(self, code: str, language: str = "python", timeout: int = 30) -> ToolResult:
        """Execute code in sandbox and return output."""
        try:
            if not code or not code.strip():
                return self.fail_response("Code is required.")

            await self._ensure_sandbox()

            # Clamp timeout
            timeout = max(1, min(int(timeout) if isinstance(timeout, (int, float, str)) else 30, 300))

            logger.info(f"[CodeInterpreter] Executing {language} code ({len(code)} chars, timeout={timeout}s)")

            # Auto-install common Python packages if code imports them
            if language == "python":
                auto_install_map = {
                    "docx": "python-docx",
                    "openpyxl": "openpyxl",
                    "pptx": "python-pptx",
                    "pandas": "pandas",
                    "matplotlib": "matplotlib",
                    "numpy": "numpy",
                    "requests": "requests",
                    "PIL": "Pillow",
                    "bs4": "beautifulsoup4",
                }
                packages_to_install = []
                for import_name, pip_name in auto_install_map.items():
                    if f"import {import_name}" in code or f"from {import_name}" in code:
                        packages_to_install.append(pip_name)
                if packages_to_install:
                    pip_cmd = f"pip install -q {' '.join(packages_to_install)} 2>/dev/null"
                    try:
                        await self.sandbox.process.exec(pip_cmd, timeout=60)
                        logger.info(f"[CodeInterpreter] Auto-installed: {', '.join(packages_to_install)}")
                    except Exception as e:
                        logger.warning(f"[CodeInterpreter] Auto-install failed: {e}")

            # Always write code to a temp file to avoid PTY corruption with inline commands.
            # Daytona PTY doubles characters and breaks on nested quotes in long inline commands.
            import hashlib
            code_hash = hashlib.md5(code.encode()).hexdigest()[:8]

            if language == "python":
                tmp_file = f"/tmp/_code_{code_hash}.py"
                runner_cmd = f"python3 {tmp_file}"
            elif language in ("javascript", "typescript"):
                ext = "js" if language == "javascript" else "ts"
                tmp_file = f"/tmp/_code_{code_hash}.{ext}"
                runner_cmd = f"node {tmp_file}" if language == "javascript" else f"npx ts-node {tmp_file}"
            else:
                return self.fail_response(f"Unsupported language: {language}. Use python, javascript, or typescript.")

            # Write code to temp file via sandbox file API (bypasses PTY entirely)
            try:
                await self.sandbox.fs.upload_file(tmp_file, code.encode('utf-8'))
            except Exception:
                # Fallback: write via base64 to avoid escaping issues
                import base64
                b64 = base64.b64encode(code.encode('utf-8')).decode('ascii')
                await self.sandbox.process.exec(f"echo '{b64}' | base64 -d > {tmp_file}", timeout=10)

            # Execute the temp file
            response = await self.sandbox.process.exec(f"{runner_cmd}; __e=$?; rm -f {tmp_file}; exit $__e", timeout=timeout)

            output = response.result or ""
            exit_code = response.exit_code

            result = {
                "language": language,
                "exit_code": exit_code,
                "output": output[:50000],  # Truncate very long output
            }

            if exit_code != 0:
                result["error"] = True
                logger.warning(f"[CodeInterpreter] Code returned exit code {exit_code}")
            else:
                logger.info(f"[CodeInterpreter] Success: {len(output)} chars output")

            return ToolResult(
                success=exit_code == 0,
                output=json.dumps(result, ensure_ascii=False) if exit_code == 0 else output
            )

        except Exception as e:
            logger.error(f"[CodeInterpreter] Error: {e}")
            return self.fail_response(f"Code execution failed: {str(e)[:300]}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "run_repl",
            "description": "Execute code in a persistent REPL session. Variables and imports persist between calls with the same session_name. Use this for multi-step data analysis, iterative development, or any workflow where state matters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "**REQUIRED** — The code to execute in the REPL session."
                    },
                    "session_name": {
                        "type": "string",
                        "description": "**OPTIONAL** — Name of the REPL session. Same name = same state. Default: 'default'.",
                        "default": "default"
                    },
                    "language": {
                        "type": "string",
                        "enum": ["python", "javascript"],
                        "description": "**OPTIONAL** — Language for the REPL. Default: python.",
                        "default": "python"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "**OPTIONAL** — Timeout in seconds (1-300). Default: 30.",
                        "default": 30
                    }
                },
                "required": ["code"],
                "additionalProperties": False
            }
        }
    })
    async def run_repl(self, code: str, session_name: str = "default", language: str = "python", timeout: int = 30) -> ToolResult:
        """Execute code in a persistent REPL session with state preservation."""
        try:
            if not code or not code.strip():
                return self.fail_response("Code is required.")

            await self._ensure_sandbox()

            timeout = max(1, min(int(timeout) if isinstance(timeout, (int, float, str)) else 30, 300))
            session_key = f"repl_{language}_{session_name}"

            logger.info(f"[CodeInterpreter] REPL '{session_name}' ({language}): {len(code)} chars")

            # Create session if it doesn't exist
            if session_key not in self._sessions:
                try:
                    await self.sandbox.process.create_session(session_key)
                    self._sessions[session_key] = True

                    # Initialize the REPL interpreter
                    if language == "python":
                        from daytona_sdk import SessionExecuteRequest
                        init_req = SessionExecuteRequest(
                            command="python3 -i 2>/dev/null",
                            var_async=True
                        )
                        await self.sandbox.process.execute_session_command(
                            session_id=session_key, req=init_req
                        )
                    logger.info(f"[CodeInterpreter] Created REPL session: {session_key}")
                except Exception as e:
                    logger.warning(f"[CodeInterpreter] Session create failed: {e}, using exec fallback")
                    # Fallback to file-based execution with state
                    return await self._repl_file_fallback(code, session_name, language, timeout)

            # Execute in session via file (most reliable for multiline code)
            return await self._repl_file_fallback(code, session_name, language, timeout)

        except Exception as e:
            logger.error(f"[CodeInterpreter] REPL error: {e}")
            return self.fail_response(f"REPL execution failed: {str(e)[:300]}")

    async def _repl_file_fallback(self, code: str, session_name: str, language: str, timeout: int) -> ToolResult:
        """Execute REPL code using file-based state persistence."""
        try:
            state_dir = f"{self.workspace_path}/.repl_state"
            state_file = f"{state_dir}/{session_name}.py" if language == "python" else f"{state_dir}/{session_name}.js"
            exec_file = f"{state_dir}/{session_name}_exec.py" if language == "python" else f"{state_dir}/{session_name}_exec.js"

            # Ensure state directory exists
            await self.sandbox.process.exec(f"mkdir -p {state_dir}")

            # Read existing state
            check = await self.sandbox.process.exec(f"cat {state_file} 2>/dev/null")
            existing_state = check.result if check.exit_code == 0 else ""

            # Combine state + new code
            full_code = existing_state + "\n" + code if existing_state else code

            # Write combined code to exec file
            await self.write_file(exec_file, full_code.encode('utf-8'))

            # Execute
            if language == "python":
                cmd = f"python3 {exec_file}"
            else:
                cmd = f"node {exec_file}"

            response = await self.sandbox.process.exec(cmd, timeout=timeout)

            output = response.result or ""
            exit_code = response.exit_code

            # If successful, save the state (append new code to state file)
            if exit_code == 0:
                await self.write_file(state_file, full_code.encode('utf-8'))

            result = {
                "session": session_name,
                "language": language,
                "exit_code": exit_code,
                "output": output[:50000],
                "state_lines": len(full_code.split('\n')),
            }

            return ToolResult(
                success=exit_code == 0,
                output=json.dumps(result, ensure_ascii=False) if exit_code == 0 else output
            )

        except Exception as e:
            return self.fail_response(f"REPL fallback error: {str(e)[:300]}")

    # ------------------------------------------------------------------ #
    #  get_preview_url                                                      #
    # ------------------------------------------------------------------ #

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_preview_url",
            "description": (
                "Return the public HTTPS preview URL for a port running inside the sandbox. "
                "Use this to share or visit a web server, API, or any service started inside the sandbox. "
                "The URL is immediately accessible via the Recoder proxy — no extra setup needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "port": {
                        "type": "integer",
                        "description": (
                            "Port number that a service is listening on inside the sandbox "
                            "(e.g. 3000 for a Next.js dev server, 8080 for a generic HTTP server, "
                            "5000 for Flask, etc.)."
                        ),
                    },
                },
                "required": ["port"],
                "additionalProperties": False,
            },
        }
    })
    async def get_preview_url(self, port: int) -> ToolResult:
        """Return the public HTTPS preview URL for a sandbox port."""
        try:
            await self._ensure_sandbox()

            port = int(port)
            if not (1 <= port <= 65535):
                return self.fail_response(f"Invalid port number: {port}. Must be between 1 and 65535.")

            url = f"https://{port}-{self.sandbox_id}.sandbox.recoder.xyz"

            return self.success_response(
                {
                    "url": url,
                    "port": port,
                    "sandbox_id": self.sandbox_id,
                    "message": (
                        f"Preview URL for port {port}: {url} — "
                        "open this in a browser or share it to access the service."
                    ),
                }
            )

        except Exception as exc:
            logger.error(f"[CodeInterpreter] get_preview_url error: {exc}", exc_info=True)
            return self.fail_response(f"Error generating preview URL: {str(exc)}")
