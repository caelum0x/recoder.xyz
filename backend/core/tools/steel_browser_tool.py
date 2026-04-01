"""
Steel Browser Tool — Managed browser sessions via self-hosted Steel service.

Unlike the in-sandbox Stagehand browser, Steel provides:
- Shared browser pool across all agents (no per-sandbox overhead)
- Anti-detection / stealth mode for production scraping
- Session persistence across tool calls
- Screenshot capture with S3 upload
- CDP (Chrome DevTools Protocol) access for advanced automation

Steel runs as a Docker service on the platform. Agents call it via HTTP.
Falls back to a useful error if Steel is not deployed.

Architecture:
  Agent → steel_navigate/act/extract/screenshot
    → HTTP POST to Steel API (http://steel:3000)
      → Managed Chromium instance
        → Page interaction via Stagehand natural language API
"""

from __future__ import annotations

import json
import aiohttp
from typing import Any

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata, method_metadata
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.utils.config import config

STEEL_URL = getattr(config, 'STEEL_URL', None) or 'http://steel:3000'
STEEL_API_KEY = getattr(config, 'STEEL_API_KEY', None) or ''

# Session cache: thread_id → session_id
_active_sessions: dict[str, str] = {}


async def _steel_request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    """Make a request to the Steel API."""
    headers: dict[str, str] = {'Content-Type': 'application/json'}
    if STEEL_API_KEY:
        headers['Authorization'] = f'Bearer {STEEL_API_KEY}'

    async with aiohttp.ClientSession() as session:
        async with session.request(
            method,
            f'{STEEL_URL}{path}',
            json=body,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if not resp.ok:
                text = await resp.text()
                raise RuntimeError(f'Steel API {method} {path} → {resp.status}: {text[:300]}')
            return await resp.json()


async def _ensure_session(thread_id: str) -> str:
    """Get or create a Steel browser session for this thread."""
    if thread_id in _active_sessions:
        # Verify session is still alive
        try:
            session_id = _active_sessions[thread_id]
            data = await _steel_request('GET', f'/v1/sessions/{session_id}')
            if data.get('status') == 'live':
                return session_id
        except Exception:
            pass
        del _active_sessions[thread_id]

    # Create new session
    data = await _steel_request('POST', '/v1/sessions', {
        'useProxy': False,
        'solveCaptchas': True,
        'sessionTimeout': 1800000,  # 30 min
    })
    session_id = data['id']
    _active_sessions[thread_id] = session_id
    logger.info('Steel session created: %s for thread %s', session_id, thread_id)
    return session_id


async def _release_session(thread_id: str) -> None:
    """Release a Steel browser session."""
    session_id = _active_sessions.pop(thread_id, None)
    if session_id:
        try:
            await _steel_request('DELETE', f'/v1/sessions/{session_id}')
        except Exception as exc:
            logger.warning('Steel session release failed: %s', exc)


@tool_metadata(
    display_name='Steel Browser',
    description='Managed browser automation with anti-detection. Navigate, interact, extract data, and screenshot web pages.',
    icon='Monitor',
    color='bg-indigo-100 dark:bg-indigo-800/50',
    weight=55,
    visible=True,
    usage_guide="""
## Steel Browser — Managed browser sessions

Production-grade browser automation backed by a managed Chromium pool.
Use for:
- Browsing sites that block bots (anti-detection enabled)
- Long-running multi-page sessions (30 min session TTL)
- Extracting structured data from dynamic pages
- Screenshot capture for visual verification

### Tools
- **steel_navigate**: Open a URL in the managed browser
- **steel_act**: Perform actions in natural language ("click login", "fill email with X")
- **steel_extract**: Extract structured data from the page
- **steel_screenshot**: Capture current page state
- **steel_scrape**: Fast single-page scrape (no JS rendering needed)
- **steel_close**: Release the browser session

### When to use Steel vs in-sandbox browser
- **Steel**: Production scraping, anti-detection needed, multi-page flows, shared sessions
- **In-sandbox browser**: Simple page loads, development testing, isolated environments
""",
)
class SteelBrowserTool:
    """Managed browser tool using self-hosted Steel service."""

    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        self.project_id = project_id
        self.thread_id = thread_id
        self.thread_manager = thread_manager

    def _success(self, output: Any) -> ToolResult:
        return ToolResult(success=True, output=output)

    def _fail(self, msg: str) -> ToolResult:
        return ToolResult(success=False, output=msg)

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_navigate',
            'description': 'Navigate the managed browser to a URL. Creates a session if one does not exist.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'url': {'type': 'string', 'description': 'URL to navigate to'},
                    'wait_for': {'type': 'string', 'description': 'CSS selector to wait for after navigation (optional)'},
                },
                'required': ['url'],
            },
        },
    })
    @method_metadata(display_name='Navigate', description='Open a URL in the managed browser')
    async def steel_navigate(self, url: str, wait_for: str | None = None) -> ToolResult:
        try:
            session_id = await _ensure_session(self.thread_id)
            body: dict[str, Any] = {'url': url}
            if wait_for:
                body['waitForSelector'] = wait_for

            data = await _steel_request('POST', f'/v1/sessions/{session_id}/actions/navigate', body)

            return self._success({
                'url': url,
                'title': data.get('title', ''),
                'status': data.get('status', 'ok'),
                'session_id': session_id,
            })
        except Exception as exc:
            logger.warning('steel_navigate failed: %s', exc)
            return self._fail(f'Navigation failed: {exc}')

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_act',
            'description': 'Perform a browser action described in natural language. Examples: "click the Sign In button", "fill in email with user@example.com", "scroll down".',
            'parameters': {
                'type': 'object',
                'properties': {
                    'action': {'type': 'string', 'description': 'Natural language description of the action'},
                    'variables': {'type': 'object', 'description': 'Variables to substitute (for sensitive data like passwords)'},
                },
                'required': ['action'],
            },
        },
    })
    @method_metadata(display_name='Act', description='Perform any browser action in natural language')
    async def steel_act(self, action: str, variables: dict[str, str] | None = None) -> ToolResult:
        try:
            session_id = await _ensure_session(self.thread_id)
            body: dict[str, Any] = {'action': action}
            if variables:
                body['variables'] = variables

            data = await _steel_request('POST', f'/v1/sessions/{session_id}/actions/act', body, timeout=30)

            return self._success({
                'action': action,
                'result': data.get('result', 'completed'),
                'screenshot_url': data.get('screenshotUrl'),
            })
        except Exception as exc:
            logger.warning('steel_act failed: %s', exc)
            return self._fail(f'Action failed: {exc}')

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_extract',
            'description': 'Extract structured data from the current page using natural language instructions.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'instruction': {'type': 'string', 'description': 'What data to extract (e.g. "get all product names and prices")'},
                    'schema': {'type': 'object', 'description': 'Optional JSON schema for the expected output structure'},
                },
                'required': ['instruction'],
            },
        },
    })
    @method_metadata(display_name='Extract', description='Extract structured data from current page')
    async def steel_extract(self, instruction: str, schema: dict[str, Any] | None = None) -> ToolResult:
        try:
            session_id = await _ensure_session(self.thread_id)
            body: dict[str, Any] = {'instruction': instruction}
            if schema:
                body['schema'] = schema

            data = await _steel_request('POST', f'/v1/sessions/{session_id}/actions/extract', body, timeout=30)

            return self._success({
                'instruction': instruction,
                'data': data.get('data', data.get('result', {})),
            })
        except Exception as exc:
            logger.warning('steel_extract failed: %s', exc)
            return self._fail(f'Extract failed: {exc}')

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_screenshot',
            'description': 'Take a screenshot of the current page in the managed browser.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'full_page': {'type': 'boolean', 'description': 'Capture full page (default: viewport only)'},
                },
            },
        },
    })
    @method_metadata(display_name='Screenshot', description='Capture current page screenshot')
    async def steel_screenshot(self, full_page: bool = False) -> ToolResult:
        try:
            session_id = await _ensure_session(self.thread_id)
            data = await _steel_request('POST', f'/v1/sessions/{session_id}/actions/screenshot', {
                'fullPage': full_page,
            })

            screenshot_url = data.get('screenshotUrl', data.get('url', ''))
            return self._success({
                'screenshot_url': screenshot_url,
                'session_id': session_id,
            })
        except Exception as exc:
            logger.warning('steel_screenshot failed: %s', exc)
            return self._fail(f'Screenshot failed: {exc}')

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_scrape',
            'description': 'Fast single-page scrape — fetches and returns page content without a full browser session. Good for static or lightly dynamic pages.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'url': {'type': 'string', 'description': 'URL to scrape'},
                    'format': {'type': 'string', 'enum': ['html', 'readability', 'markdown', 'cleaned_html'], 'description': 'Output format (default: readability)'},
                },
                'required': ['url'],
            },
        },
    })
    @method_metadata(display_name='Scrape', description='Fast single-page content scrape')
    async def steel_scrape(self, url: str, format: str = 'readability') -> ToolResult:
        try:
            data = await _steel_request('POST', '/v1/scrape', {
                'url': url,
                'format': [format],
            })

            content = data.get('content', data.get('data', ''))
            return self._success({
                'url': url,
                'format': format,
                'content': content[:10000] if isinstance(content, str) else content,
                'title': data.get('title', ''),
            })
        except Exception as exc:
            logger.warning('steel_scrape failed: %s', exc)
            return self._fail(f'Scrape failed: {exc}')

    @openapi_schema({
        'type': 'function',
        'function': {
            'name': 'steel_close',
            'description': 'Release the browser session. Call when done with browsing to free resources.',
            'parameters': {'type': 'object', 'properties': {}},
        },
    })
    @method_metadata(display_name='Close', description='Release browser session')
    async def steel_close(self) -> ToolResult:
        try:
            await _release_session(self.thread_id)
            return self._success({'status': 'session released'})
        except Exception as exc:
            return self._fail(f'Close failed: {exc}')
