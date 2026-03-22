"""Computer Use tool — browser automation via VNC in Daytona sandboxes.

Provides screenshot, click, type, scroll, and navigate actions for
browser-based tasks. Uses Daytona's computer_use API with VNC backend.
"""

import json
import base64
from typing import Optional
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger


@tool_metadata(
    display_name="Computer Use",
    description="Control a browser in the sandbox — navigate, click, type, scroll, take screenshots",
    icon="Monitor",
    color="bg-indigo-100 dark:bg-indigo-800/50",
    weight=35,
    visible=True,
    usage_guide="""
### Computer Use — Browser Automation in Sandbox

**Available Functions:**
- `computer_screenshot` — Take a screenshot of the current browser state
- `computer_navigate` — Navigate to a URL
- `computer_click` — Click at coordinates (x, y)
- `computer_type` — Type text at current cursor position
- `computer_scroll` — Scroll up or down

**Usage Pattern:**
1. Navigate to a URL
2. Take a screenshot to see the page
3. Click, type, or scroll based on what you see
4. Take another screenshot to verify

**Notes:**
- Resolution: 1048x768
- Browser runs in sandbox via VNC
- Screenshots are returned as base64 PNG
"""
)
class SandboxComputerUseTool(SandboxToolsBase):
    """Browser automation via Daytona sandbox VNC."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self._vnc_started = False

    async def _ensure_vnc(self):
        """Start VNC/browser if not already running."""
        await self._ensure_sandbox()
        if not self._vnc_started:
            try:
                await self.sandbox.computer_use.start()
                self._vnc_started = True
                logger.info(f"[ComputerUse] VNC started in sandbox {self.sandbox_id}")
            except Exception as e:
                logger.warning(f"[ComputerUse] VNC start failed: {e}, trying shell fallback")
                # Fallback: start browser via shell
                await self.sandbox.process.exec(
                    "DISPLAY=:1 chromium-browser --no-sandbox --disable-gpu --window-size=1048,768 &",
                    timeout=10
                )
                self._vnc_started = True

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "computer_screenshot",
            "description": "Take a screenshot of the current browser/desktop state. Returns base64 PNG image.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False
            }
        }
    })
    async def computer_screenshot(self) -> ToolResult:
        """Take a screenshot of the current VNC session."""
        try:
            await self._ensure_vnc()

            # Take screenshot via VNC tool
            result = await self.sandbox.process.exec(
                "DISPLAY=:1 import -window root /tmp/screenshot.png && base64 /tmp/screenshot.png | head -c 500000",
                timeout=10
            )

            if result.exit_code == 0 and result.result:
                return self.success_response({
                    "type": "screenshot",
                    "format": "base64_png",
                    "data": result.result[:500000],
                })
            else:
                return self.fail_response(f"Screenshot failed: {result.result}")

        except Exception as e:
            return self.fail_response(f"Screenshot error: {str(e)[:200]}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "computer_navigate",
            "description": "Navigate the browser to a URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "**REQUIRED** — The URL to navigate to."
                    }
                },
                "required": ["url"],
                "additionalProperties": False
            }
        }
    })
    async def computer_navigate(self, url: str) -> ToolResult:
        """Navigate browser to a URL."""
        try:
            await self._ensure_vnc()

            # Use xdotool + chromium CDP to navigate
            result = await self.sandbox.process.exec(
                f'DISPLAY=:1 chromium-browser --no-sandbox "{url}" &',
                timeout=15
            )

            return self.success_response({
                "action": "navigate",
                "url": url,
                "status": "navigated"
            })

        except Exception as e:
            return self.fail_response(f"Navigate error: {str(e)[:200]}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "computer_click",
            "description": "Click at specific coordinates on the screen.",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "**REQUIRED** — X coordinate."},
                    "y": {"type": "integer", "description": "**REQUIRED** — Y coordinate."}
                },
                "required": ["x", "y"],
                "additionalProperties": False
            }
        }
    })
    async def computer_click(self, x: int, y: int) -> ToolResult:
        """Click at coordinates."""
        try:
            await self._ensure_vnc()

            result = await self.sandbox.process.exec(
                f"DISPLAY=:1 xdotool mousemove {x} {y} click 1",
                timeout=5
            )

            return self.success_response({
                "action": "click",
                "x": x, "y": y,
                "status": "clicked"
            })

        except Exception as e:
            return self.fail_response(f"Click error: {str(e)[:200]}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "computer_type",
            "description": "Type text at the current cursor position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "**REQUIRED** — Text to type."}
                },
                "required": ["text"],
                "additionalProperties": False
            }
        }
    })
    async def computer_type(self, text: str) -> ToolResult:
        """Type text."""
        try:
            await self._ensure_vnc()

            # Escape special characters for xdotool
            escaped = text.replace("'", "'\\''")
            result = await self.sandbox.process.exec(
                f"DISPLAY=:1 xdotool type --delay 50 '{escaped}'",
                timeout=30
            )

            return self.success_response({
                "action": "type",
                "text_length": len(text),
                "status": "typed"
            })

        except Exception as e:
            return self.fail_response(f"Type error: {str(e)[:200]}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "computer_scroll",
            "description": "Scroll the page up or down.",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["up", "down"],
                        "description": "**REQUIRED** — Scroll direction."
                    },
                    "amount": {
                        "type": "integer",
                        "description": "**OPTIONAL** — Number of scroll clicks. Default: 3.",
                        "default": 3
                    }
                },
                "required": ["direction"],
                "additionalProperties": False
            }
        }
    })
    async def computer_scroll(self, direction: str, amount: int = 3) -> ToolResult:
        """Scroll page."""
        try:
            await self._ensure_vnc()

            button = "5" if direction == "down" else "4"
            result = await self.sandbox.process.exec(
                f"DISPLAY=:1 xdotool click --repeat {amount} --delay 100 {button}",
                timeout=5
            )

            return self.success_response({
                "action": "scroll",
                "direction": direction,
                "amount": amount,
                "status": "scrolled"
            })

        except Exception as e:
            return self.fail_response(f"Scroll error: {str(e)[:200]}")
