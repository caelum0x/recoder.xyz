"""Clean, side-effect-free browser-control HTTP service for the browser-use engine.

Exposes a small loopback HTTP surface for the deterministic browser primitives
the engine provides — navigate, extract (page state as text), and screenshot —
driven directly through ``BrowserSession`` over CDP. These primitives need no
LLM and no API keys; they are the honest, verifiable substrate an agent loop is
built on. (Full LLM-driven autonomy lives in ``browser_use.agent.service.Agent``
and requires provider keys; this service is the deterministic control plane.)

Design constraints (why this file looks the way it does):

- **No import-time heavy side-effects.** ``browser_use`` (and the chromium/CDP
  machinery it pulls in) is NOT imported at module import time. Importing this
  module (and ``python -m py_compile``) succeeds on a bare interpreter with only
  ``aiohttp`` present — aiohttp is already a core browser-use dependency, so the
  service adds zero new deps. The heavy imports happen lazily inside handlers.

- **Honest capability probe.** ``/health`` reports whether ``browser_use`` is
  importable AND whether a chromium executable can actually be located on this
  host (via the engine's own ``LocalBrowserWatchdog._find_installed_browser_path``).
  When chromium is not installed (e.g. skipped under disk pressure), the service
  still BOOTS and reports ``browser_available: false`` with a truthful reason
  instead of faking readiness. Navigation/screenshot then return ``503``.

Endpoints:
    GET  /health      -> capability report (imports + chromium presence)
    POST /navigate    -> body {"url": str}; opens a session, navigates, returns
                         {"url", "title", "final_url"}
    POST /extract      -> body {"url": str}; navigates and returns page state as
                         text {"url", "text"} (markdown-ish DOM text for LLMs)
    POST /screenshot  -> body {"url": str, "full_page"?: bool}; returns
                         {"url", "screenshot_base64", "format"}

Each request opens and cleanly tears down a ``BrowserSession`` (stateless,
process-safe). Sessions are headless by default.

Boot:
    PORT=8896 python service_entry.py
"""

import asyncio
import base64
import os

from aiohttp import web


def _probe_capability():
	"""Determine, without launching anything, whether real browsing is possible.

	Returns ``(available, reason, executable_path)``. Attempts the lazy
	``browser_use`` import and then asks the engine's own watchdog to locate a
	chromium executable. Never launches a browser, so ``/health`` stays cheap and
	side-effect-free. Called per-request (cheap: import is cached by the import
	system after first success).
	"""
	try:
		from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
	except Exception as exc:  # pragma: no cover - only without deps installed
		return False, f'browser_use import failed: {exc}', None

	try:
		executable_path = LocalBrowserWatchdog._find_installed_browser_path()
	except Exception as exc:  # pragma: no cover - defensive
		return False, f'browser executable probe failed: {exc}', None

	if not executable_path:
		return False, 'no chromium/chrome executable found on host', None
	return True, None, executable_path


async def _with_session(coro_factory):
	"""Open a headless ``BrowserSession``, run ``coro_factory(session)``, tear down.

	Guarantees the session is stopped even on error, so no orphaned chromium
	processes leak. ``browser_use`` is imported lazily here, never at module top.
	"""
	from browser_use.browser import BrowserProfile, BrowserSession

	profile = BrowserProfile(headless=True)
	session = BrowserSession(browser_profile=profile)
	await session.start()
	try:
		return await coro_factory(session)
	finally:
		try:
			await session.stop()
		except Exception:  # pragma: no cover - best-effort teardown
			pass


def _read_url(payload):
	"""Extract and validate a ``url`` string from the JSON body.

	Returns ``(url, error_response)``; on failure ``url`` is ``None`` and a
	400 web.Response is returned.
	"""
	url = payload.get('url') if isinstance(payload, dict) else None
	if not isinstance(url, str) or not url:
		return None, web.json_response({'error': 'expected JSON body {url: str}'}, status=400)
	return url, None


def _degraded_response(reason):
	"""Uniform honest-degrade response when the browser cannot run."""
	return web.json_response({'error': f'browser unavailable: {reason}'}, status=503)


async def health(request):
	available, reason, executable_path = _probe_capability()
	return web.json_response(
		{
			'browser_available': available,
			'executable_path': executable_path,
			'reason': reason,
			'headless': True,
		}
	)


async def navigate(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error

	async def _run(session):
		await session.navigate_to(url)
		tabs = await session.get_tabs()
		current = tabs[0] if tabs else None
		return web.json_response(
			{
				'url': url,
				'title': getattr(current, 'title', None),
				'final_url': getattr(current, 'url', url),
			}
		)

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'navigate failed: {exc}'}, status=500)


async def extract(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error

	async def _run(session):
		await session.navigate_to(url)
		text = await session.get_state_as_text()
		return web.json_response({'url': url, 'text': text})

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'extract failed: {exc}'}, status=500)


async def screenshot(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error
	full_page = bool(payload.get('full_page', False))

	async def _run(session):
		await session.navigate_to(url)
		data = await session.take_screenshot(full_page=full_page)
		return web.json_response(
			{
				'url': url,
				'format': 'png',
				'screenshot_base64': base64.b64encode(data).decode('ascii'),
			}
		)

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'screenshot failed: {exc}'}, status=500)


def build_app():
	"""Construct the aiohttp application. Pure — no I/O, safe to import."""
	app = web.Application()
	app.add_routes(
		[
			web.get('/health', health),
			web.post('/navigate', navigate),
			web.post('/extract', extract),
			web.post('/screenshot', screenshot),
		]
	)
	return app


if __name__ == '__main__':  # pragma: no cover
	host = os.getenv('BROWSER_SERVICE_HOST', '127.0.0.1')
	port = int(os.getenv('PORT', '8896'))
	web.run_app(build_app(), host=host, port=port)
