import asyncio
import shlex
from typing import Optional, Dict, Any
import time
from uuid import uuid4
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.sandbox.sandbox import create_session_with_recovery, execute_session_command_with_recovery
from core.agentpress.thread_manager import ThreadManager
from core.utils.tool_output_streaming import stream_tool_output, get_tool_output_streaming_context, get_current_tool_call_id
from core.utils.logger import logger

@tool_metadata(
    display_name="Bash",
    description="Execute bash commands in the workspace with optional timeout",
    icon="Terminal",
    color="bg-gray-100 dark:bg-gray-800/50",
    is_core=True,
    weight=20,
    visible=True,
    usage_guide="""
## Bash - Execute bash commands in the workspace

Executes bash commands in the workspace directory with real-time output streaming. Working directory persists between commands.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

### Before Executing Commands

1. **Directory Verification:**
   - If the command will create new directories or files, first use `ls` to verify the parent directory exists
   - Example: before running "mkdir foo/bar", first use `ls foo` to check that "foo" exists

2. **Command Execution:**
   - Always quote file paths that contain spaces with double quotes
   - Example: cd "/workspace/my folder" (correct) vs cd /workspace/my folder (incorrect)

### When to Use
- Installing packages (pip install, npm install, apt-get)
- Running build commands and scripts
- Git operations (status, diff, log, add, commit)
- Running tests or linters
- System administration tasks
- Any task requiring shell execution

### When NOT to Use
- DO NOT use cat/head/tail to read files - use read_file instead
- DO NOT use sed/awk to edit files - use edit_file or str_replace instead
- DO NOT use echo/heredoc to create files - use create_file instead
- DO NOT use find for file search - use Glob patterns instead
- DO NOT use grep for content search - use search_file instead

### Important Notes
- Commands timeout after 300 seconds (5 minutes) by default
- Output is truncated if it exceeds 50000 characters
- Working directory is /workspace by default
- Use ABSOLUTE paths in commands (e.g., /workspace/src/main.py)
- Always use non-interactive flags (-y, --yes, -f) to avoid prompts

### Multiple Commands
- If commands are independent and can run in parallel, make multiple tool calls
- If commands depend on each other, chain with && (e.g., `git add . && git commit -m "message"`)
- Use `;` only when you need to run commands sequentially but don't care if earlier commands fail
- Try to maintain your current working directory by using absolute paths and avoiding `cd`

### Long-Running Processes
For background processes (servers, watches), use tmux:
```bash
# Start background server
tmux new-session -d -s myserver 'npm run dev'

# Check on process
tmux capture-pane -t myserver -p

# Kill process
tmux kill-session -t myserver
```

### Git Operations
- NEVER use git commands with -i flag (interactive mode not supported)
- NEVER use --amend unless explicitly requested
- NEVER force push to main/master
- When committing, use HEREDOC for multiline messages

### Port 8080
Port 8080 is AUTO-EXPOSED and publicly accessible. Files served from /workspace are automatically available via preview URLs.

### Pre-installed Tools & Libraries
The sandbox has these tools available for shell commands:

**System tools:**
- `git`, `curl`, `wget` — version control and downloads
- `convert`, `identify` (ImageMagick 7) — image creation, conversion, resizing, compositing, watermarks
- `ffmpeg`, `ffprobe` — video/audio processing, format conversion, screen recording, thumbnails
- `chromium` — headless browser for screenshots and web scraping

**Python packages (use via `python3 script.py`):**
- `openpyxl` — create/edit Excel spreadsheets (.xlsx) with formulas, charts, styling
- `python-pptx` — create PowerPoint presentations (.pptx) programmatically
- `python-docx` — create Word documents (.docx) with headings, tables, images
- `pandas`, `numpy`, `matplotlib`, `seaborn` — data analysis and charting
- `pillow` (PIL) — image processing, resize, crop, filters, text overlay
- `requests`, `beautifulsoup4` — web scraping
- `flask`, `django` — web servers

**Example: Create a chart image with matplotlib:**
```bash
python3 -c "
import matplotlib.pyplot as plt
plt.bar(['Q1','Q2','Q3','Q4'], [100,150,130,180])
plt.title('Revenue')
plt.savefig('/workspace/chart.png', dpi=150)
print('Chart saved')
"
```

**Example: Convert image format with ImageMagick:**
```bash
convert /workspace/photo.jpg -resize 800x600 -quality 85 /workspace/photo_small.jpg
```

**Example: Create video from images with FFmpeg:**
```bash
ffmpeg -framerate 1 -pattern_type glob -i '/workspace/slides/*.png' -c:v libx264 -pix_fmt yuv420p /workspace/slideshow.mp4
```
"""
)
class SandboxShellTool(SandboxToolsBase):
    """Tool for executing shell commands in a Daytona sandbox.
    Commands run synchronously with real-time output streaming.
    For long-running processes, use tmux directly in your commands."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    @staticmethod
    def _should_use_direct_session(command: str) -> bool:
        normalized = command.lower()
        direct_patterns = (
            "npm ",
            "npx ",
            "pnpm ",
            "yarn ",
            "bun ",
            "vite ",
            "next ",
            "react-scripts ",
            "create-react-app",
            "create-vite",
        )
        return any(pattern in normalized for pattern in direct_patterns)

    @staticmethod
    def _should_background_command(command: str) -> bool:
        normalized = command.lower().strip()
        if any(token in normalized for token in ("nohup ", "tmux ", "screen ", "pm2 ", " 2>&1 &", " &")):
            return False

        background_patterns = (
            "npm start",
            "npm run dev",
            "npm run start",
            "pnpm dev",
            "pnpm start",
            "yarn dev",
            "yarn start",
            "bun dev",
            "bun start",
            "react-scripts start",
            "next dev",
            "vite",
        )
        return any(pattern in normalized for pattern in background_patterns)

    @classmethod
    def _prepare_command(cls, command: str) -> str:
        if not cls._should_background_command(command):
            return command

        quoted_command = shlex.quote(command)
        return (
            "if command -v tmux >/dev/null 2>&1; then "
            "tmux kill-session -t recoder-dev-server >/dev/null 2>&1 || true; "
            f"tmux new-session -d -s recoder-dev-server \"bash -lc {quoted_command}\"; "
            "printf 'DEV_SERVER_STARTED tmux:%s\\n' 'recoder-dev-server'; "
            "else "
            f"nohup bash -lc {quoted_command} >/tmp/recoder-devserver.log 2>&1 & "
            "printf 'DEV_SERVER_STARTED pid:%s\\n' \"$!\"; "
            "fi"
        )

    @staticmethod
    def _wrap_command_for_shell(command: str, cwd: str) -> str:
        quoted_cwd = shlex.quote(cwd)
        return "\n".join(
            [
                'export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"',
                'for nvm_sh in /usr/local/nvm/nvm.sh /home/daytona/.nvm/nvm.sh "$NVM_DIR/nvm.sh"; do',
                '  [ -n "$nvm_sh" ] && [ -f "$nvm_sh" ] && . "$nvm_sh" >/dev/null 2>&1 && break || true',
                "done",
                'if ! command -v node >/dev/null 2>&1; then',
                '  for node_dir in /usr/local/nvm/versions/node/*/bin /home/daytona/.nvm/versions/node/*/bin /usr/local/bin /usr/bin; do',
                '    [ -d "$node_dir" ] && export PATH="$node_dir:$PATH"',
                "  done",
                "fi",
                f"cd {quoted_cwd}",
                SandboxShellTool._prepare_command(command),
            ]
        )

    @staticmethod
    def _candidate_preview_ports(command: str) -> list[int]:
        import re

        ports: list[int] = []
        for match in re.finditer(r"(?:--port|-p)\s+(\d{2,5})", command):
            try:
                ports.append(int(match.group(1)))
            except ValueError:
                pass

        normalized = command.lower()
        if "vite" in normalized and 5173 not in ports:
            ports.append(5173)
        if any(token in normalized for token in ("next", "react-scripts", "npm start", "npm run dev", "npm run start")) and 3000 not in ports:
            ports.append(3000)

        for fallback in (5173, 3000, 8080):
            if fallback not in ports:
                ports.append(fallback)
        return ports

    async def _maybe_attach_preview_info(self, payload: Dict[str, Any], command: str) -> Dict[str, Any]:
        if not self._should_background_command(command):
            return payload

        for port in self._candidate_preview_ports(command):
            try:
                for _ in range(12):
                    probe = await self.sandbox.process.exec(
                        f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 2 http://localhost:{port}/ || true",
                        timeout=5,
                    )
                    code = (probe.result or "").strip()
                    if code and code != "000":
                        preview_link = await self.sandbox.get_preview_link(port)
                        url = preview_link.url if hasattr(preview_link, "url") else str(preview_link)
                        payload["preview_port"] = port
                        payload["preview_url"] = url
                        return payload
                    await asyncio.sleep(2)
            except Exception as preview_err:
                logger.debug(f"[sb_shell_tool] Preview probe failed for port {port}: {preview_err}")

        return payload

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "execute_command",
            "description": """Execute a bash command in the workspace directory with optional timeout.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command:
1. If the command creates new directories/files, first verify the parent directory exists using `ls`
2. Always quote file paths that contain spaces with double quotes

Usage notes:
- Commands timeout after 900 seconds by default for long-running workspace setup
- Maximum timeout is 1800 seconds (30 minutes)
- Output is truncated if it exceeds 50000 characters
- For long-running processes, use tmux: `tmux new-session -d -s name 'command'`
- Chain dependent commands with && (e.g., `git add . && git commit -m "message"`)
- Avoid using cat, head, tail, sed, awk, echo, find, grep - use dedicated tools instead""",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "**REQUIRED** - The bash command to execute. Commands run synchronously and wait for completion."
                    },
                    "description": {
                        "type": "string",
                        "description": "**OPTIONAL** - Clear, concise description of what this command does. For simple commands (git, npm), keep it brief (5-10 words). For complex commands (piped commands, obscure flags), add enough context to clarify what it does."
                    },
                    "folder": {
                        "type": "string",
                        "description": "**OPTIONAL** - Relative path to a subdirectory of /workspace where the command should be executed. Example: 'src/data'"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "**OPTIONAL** - Timeout in seconds (max 1800). Default: 900 (15 minutes). Increase for longer setup/install operations.",
                        "default": 900
                    }
                },
                "required": ["command"],
                "additionalProperties": False
            }
        }
    })
    async def execute_command(
        self,
        command: str,
        description: Optional[str] = None,
        folder: Optional[str] = None,
        timeout: int = 900
    ) -> ToolResult:
        try:
            # Ensure sandbox is initialized
            await self._ensure_sandbox()
            
            # Set up working directory
            cwd = self.workspace_path
            if folder:
                folder = folder.strip('/')
                cwd = f"{self.workspace_path}/{folder}"

            normalized_command = command.lower()
            if timeout <= 300 and any(
                pattern in normalized_command for pattern in (
                    "npm install",
                    "pnpm install",
                    "yarn install",
                    "bun install",
                    "apt-get install",
                    "pip install",
                )
            ):
                timeout = 900

            use_direct_session = self._should_use_direct_session(command)
            wrapped_command = self._wrap_command_for_shell(command, cwd)

            if use_direct_session:
                logger.info("[SHELL] Using direct session execution for JS workspace command")
                return await self._fallback_execute(wrapped_command, cwd, timeout, wrapped=True)
            
            # Use PTY for real-time streaming
            tool_output_ctx = get_tool_output_streaming_context()
            tool_call_id = get_current_tool_call_id() or f"cmd_{str(uuid4())[:8]}"
            logger.debug(f"[SHELL STREAMING] Using tool_call_id: {tool_call_id}")
            
            # Rewrite python3 -c / python -c / node -e commands to use temp files
            # PTY corrupts long inline commands (character doubling, line wrapping)
            import re as _re
            inline_match = _re.match(
                r"""^(python3?|node)\s+(-[ce])\s+(['"])(.*)\3\s*$""",
                command, _re.DOTALL,
            )
            if inline_match and len(command) > 80:
                interpreter = inline_match.group(1)
                code_body = inline_match.group(4)
                ext = "py" if "python" in interpreter else "js"
                import hashlib
                h = hashlib.md5(code_body.encode()).hexdigest()[:8]
                tmp = f"/tmp/_inline_{h}.{ext}"
                # Write code to file first, then run
                import base64
                b64 = base64.b64encode(code_body.encode("utf-8")).decode("ascii")
                pre_cmd = f"printf '%s' '{b64}' | base64 -d > {tmp}"
                await self.sandbox.process.exec(pre_cmd, timeout=10)
                command = f"{interpreter} {tmp}; __e=$?; rm -f {tmp}; exit $__e"
                logger.info(f"[SHELL] Rewrote inline {interpreter} command ({len(code_body)} chars) to temp file {tmp}")

            # Track output for streaming
            output_buffer = []
            exit_code = 0
            
            async def on_pty_data(data: bytes):
                try:
                    text = data.decode("utf-8", errors="replace")
                    output_buffer.append(text)
                    
                    # Stream output to frontend if we have a tool output streaming context
                    if tool_output_ctx:
                        await stream_tool_output(
                            tool_call_id=tool_call_id,
                            output_chunk=text,
                            is_final=False,
                            tool_name="execute_command"
                        )
                except Exception as e:
                    logger.warning(f"Error processing PTY output: {e}")
            
            try:
                from daytona_sdk.common.pty import PtySize
                
                pty_session_id = f"cmd-{str(uuid4())[:8]}"
                
                # Create PTY session with output callback
                pty_handle = await self.sandbox.process.create_pty_session(
                    id=pty_session_id,
                    on_data=on_pty_data,
                    pty_size=PtySize(cols=120, rows=40)
                )
                
                # Add marker to detect completion
                marker = f"__CMD_DONE_{str(uuid4())[:8]}__"
                
                # Check if command contains a heredoc - if so, we need the marker on a new line
                # Heredocs require the delimiter (EOF, etc.) to be on its own line
                # Common heredoc patterns: << EOF, << 'EOF', << "EOF", <<- EOF, <<-'EOF', etc.
                import re
                heredoc_pattern = r'<<-?\s*[\'"]?\w+[\'"]?\s*$'
                pty_command = "\n".join([
                    "stty -echo 2>/dev/null || true",
                    wrapped_command,
                ])
                if re.search(heredoc_pattern, command, re.MULTILINE):
                    # Command has heredoc - put marker on a separate line
                    full_command = f"{pty_command}\necho '{marker}' $?\n"
                else:
                    full_command = f"{pty_command}\necho '{marker}' $?\n"
                
                # Send the command
                await pty_handle.send_input(full_command)
                
                # Wait for completion or timeout
                # Note: marker appears TWICE in output:
                # 1. When the terminal echoes the typed command
                # 2. When the echo command actually executes after completion
                # We need to wait for the SECOND occurrence
                start_time = time.time()
                while (time.time() - start_time) < timeout:
                    await asyncio.sleep(0.1)
                    
                    # Check if marker appeared in output (need 2 occurrences)
                    current_output = "".join(output_buffer)
                    marker_count = current_output.count(marker)
                    if marker_count >= 2:
                        # Extract exit code from the LAST marker line (the actual output)
                        try:
                            marker_idx = current_output.rfind(marker)
                            after_marker = current_output[marker_idx + len(marker):].strip().split()[0]
                            exit_code = int(after_marker) if after_marker.isdigit() else 0
                        except Exception as e:
                            logger.warning(f"[sb_shell_tool] Failed to parse exit code from marker output: {e}")
                            exit_code = 0
                        break
                else:
                    # Timeout reached
                    exit_code = -1
                
                # Kill PTY session
                try:
                    await pty_handle.kill()
                except Exception as e:
                    logger.debug(f"[sb_shell_tool] Failed to kill PTY session (non-critical): {e}")
                
                # Clean output (remove marker line and control sequences)
                final_output = "".join(output_buffer)
                
                # Remove the marker line from output
                if marker in final_output:
                    marker_idx = final_output.rfind(marker)
                    # Find the start of the line containing the marker
                    line_start = final_output.rfind('\n', 0, marker_idx)
                    if line_start != -1:
                        final_output = final_output[:line_start]
                
                # Strip ANSI escape sequences for cleaner output
                import re
                ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
                final_output = ansi_escape.sub('', final_output)
                
                # Stream final message
                if tool_output_ctx:
                    await stream_tool_output(
                        tool_call_id=tool_call_id,
                        output_chunk="",
                        is_final=True,
                        tool_name="execute_command"
                    )
                
                if exit_code == -1:
                    return self.success_response({
                        "output": final_output.strip(),
                        "cwd": cwd,
                        "exit_code": exit_code,
                        "timeout": True,
                        "message": f"Command timed out after {timeout} seconds. For long-running processes, use tmux: `tmux new-session -d -s name 'command'`"
                    })
                
                payload = {
                    "output": final_output.strip(),
                    "cwd": cwd,
                    "exit_code": exit_code
                }
                payload = await self._maybe_attach_preview_info(payload, command)
                return self.success_response(payload)
                
            except Exception as pty_error:
                logger.warning(f"PTY execution failed, falling back to direct execution: {pty_error}")
                # Fall back to direct session execution
                return await self._fallback_execute(wrapped_command, cwd, timeout, wrapped=True)
                
        except Exception as e:
            return self.fail_response(f"Error executing command: {str(e)}")

    async def _fallback_execute(self, command: str, cwd: str, timeout: int, wrapped: bool = False) -> ToolResult:
        """Fallback execution method using direct session commands."""
        try:
            from daytona_sdk import SessionExecuteRequest
            
            session_id = f"cmd_{str(uuid4())[:8]}"
            await create_session_with_recovery(self.sandbox, session_id)
            
            try:
                final_command = command if wrapped else self._wrap_command_for_shell(command, cwd)
                session_cwd = "." if wrapped else cwd
                req = SessionExecuteRequest(
                    command=final_command,
                    var_async=False,
                    cwd=session_cwd
                )
                
                response = await execute_session_command_with_recovery(
                    self.sandbox,
                    session_id=session_id,
                    req=req,
                    timeout=timeout,
                    recreate_session=True,
                )
                
                logs = await self.sandbox.process.get_session_command_logs(
                    session_id=session_id,
                    command_id=response.cmd_id
                )
                
                logs_output = logs.output if logs and logs.output else ""
                
                payload = {
                    "output": logs_output,
                    "cwd": cwd,
                    "exit_code": response.exit_code
                }
                payload = await self._maybe_attach_preview_info(payload, command)
                return self.success_response(payload)
            finally:
                try:
                    await self.sandbox.process.delete_session(session_id)
                except Exception as e:
                    logger.debug(f"[sb_shell_tool] Failed to delete fallback session {session_id} (non-critical): {e}")

        except Exception as e:
            return self.fail_response(f"Error executing command: {str(e)}")

    async def _execute_raw_command(self, command: str, retry_count: int = 0) -> Dict[str, Any]:
        """Execute a raw command directly in the sandbox.
        
        Uses a per-call session to avoid race conditions when multiple commands run in parallel.
        
        Args:
            command: The command to execute
            retry_count: Internal counter for retry attempts (max 2)
        """
        session_id = f"cmd_{str(uuid4())[:8]}"
        
        from daytona_sdk import SessionExecuteRequest
        
        try:
            await self._ensure_sandbox()
            await create_session_with_recovery(self.sandbox, session_id)
            
            req = SessionExecuteRequest(
                command=command,
                var_async=False,
                cwd=self.workspace_path
            )
            
            response = await execute_session_command_with_recovery(
                self.sandbox,
                session_id=session_id,
                req=req,
                timeout=30,
                recreate_session=True,
            )
            
            logs = await self.sandbox.process.get_session_command_logs(
                session_id=session_id,
                command_id=response.cmd_id
            )
            
            logs_output = logs.output if logs and logs.output else ""
            
            return {
                "output": logs_output,
                "exit_code": response.exit_code
            }
            
        except Exception as e:
            error_str = str(e).lower()
            error_repr = repr(e).lower()
            is_session_error = (
                "session not found" in error_str or
                "not found" in error_str or
                "session" in error_str and "not" in error_str and "found" in error_str or
                "404" in error_str or
                "session not found" in error_repr
            )
            
            if is_session_error and retry_count < 2:
                logger.warning(
                    f"Session error detected (attempt {retry_count + 1}/2): {type(e).__name__}: {e}. "
                    f"Retrying with new session..."
                )
                return await self._execute_raw_command(command, retry_count + 1)
            else:
                if is_session_error:
                    logger.error(
                        f"Session error persisted after {retry_count + 1} attempts. "
                        f"Error: {type(e).__name__}: {e}"
                    )
                raise
        finally:
            try:
                await self.sandbox.process.delete_session(session_id)
            except Exception as e:
                logger.debug(f"[sb_shell_tool] Failed to delete raw command session {session_id} (non-critical): {e}")

    async def cleanup(self):
        """Clean up resources."""
        pass
