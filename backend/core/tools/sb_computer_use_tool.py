"""Computer Use tool — browser automation via VNC in Daytona sandboxes.

Provides screenshot, click, type, scroll, and navigate actions for
browser-based tasks. Uses Daytona's computer_use API with VNC backend.

The slim sandbox image (daytonaio/sandbox:0.5.0-slim) lacks VNC, Xvfb,
and a browser. When computer use is first requested, this tool installs
the required packages automatically if they are missing.
"""

import json
import base64
import asyncio
from typing import Optional
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger

# Packages needed for computer use that the slim image lacks
_COMPUTER_USE_INSTALL_SCRIPT = """
# Check if Xvfb is already available (full image)
if command -v Xvfb >/dev/null 2>&1 && command -v x11vnc >/dev/null 2>&1; then
    echo "DEPS_ALREADY_INSTALLED"
    exit 0
fi

echo "Installing computer-use dependencies (Xvfb, x11vnc, chromium, xdotool, imagemagick)..."

export DEBIAN_FRONTEND=noninteractive

# Update package lists
sudo apt-get update -qq || true

# Try chromium-browser first (Debian/older Ubuntu), fall back to chromium (newer Ubuntu)
if sudo apt-get install -y -qq --no-install-recommends \
    xvfb x11vnc xdotool imagemagick chromium-browser 2>/dev/null; then
    echo "Installed with chromium-browser"
elif sudo apt-get install -y -qq --no-install-recommends \
    xvfb x11vnc xdotool imagemagick chromium 2>/dev/null; then
    echo "Installed with chromium"
else
    echo "INSTALL_FAILED"
    exit 1
fi

# Clean up apt cache to save space
sudo apt-get clean && sudo rm -rf /var/lib/apt/lists/* || true

echo "DEPS_INSTALLED_OK"
""".strip()

# Script to start Xvfb + x11vnc for VNC-based computer use
_VNC_START_SCRIPT = """
set -e

# Kill any existing Xvfb/x11vnc to avoid conflicts
pkill -f Xvfb || true
pkill -f x11vnc || true
sleep 0.5

# Start Xvfb (virtual framebuffer) on display :1
Xvfb :1 -screen 0 1048x768x24 -ac +extension GLX +render -noreset &
sleep 1

# Start x11vnc bound to display :1
x11vnc -display :1 -nopw -listen 0.0.0.0 -xkb -forever -shared &
sleep 0.5

echo "VNC_STARTED"
""".strip()


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
        self._deps_installed = False

    async def _write_and_run_script(self, script_content: str, script_path: str, timeout: int = 60) -> str:
        """Write a script to the sandbox and execute it. Returns stdout."""
        # Write the script using base64 to avoid shell escaping issues
        b64 = base64.b64encode(script_content.encode()).decode()
        await self.sandbox.process.exec(
            f"echo '{b64}' | base64 -d > {script_path} && chmod +x {script_path}",
            timeout=10
        )
        result = await self.sandbox.process.exec(f"bash {script_path}", timeout=timeout)
        return (result.result or "").strip()

    async def _install_computer_use_deps(self):
        """Install VNC/Xvfb/browser if missing (slim image doesn't have them)."""
        if self._deps_installed:
            return

        logger.info(f"[ComputerUse] Checking/installing computer-use deps in sandbox {self.sandbox_id}")
        try:
            output = await self._write_and_run_script(
                _COMPUTER_USE_INSTALL_SCRIPT,
                "/tmp/_cu_install.sh",
                timeout=180  # Allow up to 3 minutes for apt install
            )
            if "DEPS_ALREADY_INSTALLED" in output:
                logger.info(f"[ComputerUse] Dependencies already present in sandbox {self.sandbox_id}")
            elif "DEPS_INSTALLED_OK" in output:
                logger.info(f"[ComputerUse] Dependencies installed successfully in sandbox {self.sandbox_id}")
            else:
                logger.warning(f"[ComputerUse] Dependency install output: {output[:300]}")
            self._deps_installed = True
        except Exception as e:
            logger.error(f"[ComputerUse] Failed to install deps: {e}")
            raise RuntimeError(
                f"Could not install computer-use dependencies (Xvfb, VNC, browser) in sandbox. "
                f"Error: {str(e)[:200]}"
            )

    async def _start_vnc_manually(self):
        """Start Xvfb + x11vnc manually via shell commands."""
        logger.info(f"[ComputerUse] Starting VNC manually in sandbox {self.sandbox_id}")
        try:
            output = await self._write_and_run_script(
                _VNC_START_SCRIPT,
                "/tmp/_cu_vnc_start.sh",
                timeout=30
            )
            if "VNC_STARTED" in output:
                logger.info(f"[ComputerUse] VNC started manually in sandbox {self.sandbox_id}")
            else:
                logger.warning(f"[ComputerUse] VNC start output: {output[:200]}")
        except Exception as e:
            logger.error(f"[ComputerUse] Manual VNC start failed: {e}")
            raise

    async def _ensure_vnc(self):
        """Start VNC/browser if not already running.

        Strategy:
        1. Try the Daytona SDK's computer_use.start() (works on full image).
        2. If that fails, install missing deps (Xvfb, VNC, browser) and start manually.
        """
        await self._ensure_sandbox()
        if self._vnc_started:
            return

        # Attempt 1: Try Daytona SDK computer_use API (works if full image)
        try:
            await self.sandbox.computer_use.start()
            self._vnc_started = True
            self._deps_installed = True  # If SDK works, deps are present
            logger.info(f"[ComputerUse] VNC started via SDK in sandbox {self.sandbox_id}")
            return
        except Exception as e:
            logger.warning(f"[ComputerUse] SDK computer_use.start() failed: {e}")

        # Attempt 2: Install deps if needed (slim image) and start VNC manually
        await self._install_computer_use_deps()
        await self._start_vnc_manually()

        # Start chromium browser on the virtual display
        try:
            await self.sandbox.process.exec(
                "DISPLAY=:1 chromium-browser --no-sandbox --disable-gpu "
                "--window-size=1048,768 --no-first-run --disable-default-apps "
                "--disable-translate --disable-extensions about:blank &",
                timeout=10
            )
            logger.info(f"[ComputerUse] Browser started in sandbox {self.sandbox_id}")
        except Exception as e:
            logger.warning(f"[ComputerUse] Browser start warning (may still work): {e}")

        # Give VNC + browser a moment to stabilize
        await asyncio.sleep(2)
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
