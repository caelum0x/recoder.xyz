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

Deep browsing endpoints (schema-guided + interactive, still deterministic /
CDP-driven except /run_task which is the LLM-driven autonomy loop):
    POST /extract_structured -> body {"url": str, "fields": {name: selector|
                         {"selector": str, "attr"?: str, "all"?: bool}}};
                         navigates and returns {"url", "data": {name: value}}
                         extracted per-selector over live CDP (no LLM).
    POST /run_task     -> body {"task": str, "max_steps"?: int}; runs the REAL
                         ``browser_use.Agent`` multi-step LLM loop and returns
                         {"task","done","success","steps","final_result","urls"}.
                         Truthfully 503s when no provider key is configured.
    POST /screenshot_annotate -> body {"url": str, "full_page"?: bool,
                         "max_elements"?: int}; draws labeled boxes over the
                         interactive elements and returns the annotated PNG plus
                         {"annotations": [{index,tag,text,rect}]}.
    POST /fill_form    -> body {"url": str, "fields": [{"selector": str,
                         "value": any, "type"?: str}], "submit"?: str}; fills each
                         field over live CDP (dispatching input/change), optionally
                         clicks ``submit`` and returns {"filled","submitted",
                         "final_url"}.

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


# ---------------------------------------------------------------------------
# Deep browsing: schema-guided extraction, interactive form-fill, annotated
# screenshots (all deterministic over live CDP) + the LLM-driven task loop.
#
# The three deterministic ops evaluate a small, self-contained JS function in the
# page over CDP ``Runtime.evaluate`` — no LLM, no API key. The argument is
# JSON-embedded into the call expression (the function is a pure ``(arg) => ...``).
# ---------------------------------------------------------------------------

# Extract each named field by CSS selector. A field is a bare selector string
# (→ trimmed innerText) or an object {selector, attr?, all?}. Missing → null.
_EXTRACT_JS = """(spec) => {
	const out = {};
	for (const [name, raw] of Object.entries(spec)) {
		const f = (typeof raw === 'string') ? { selector: raw } : (raw || {});
		try {
			if (!f.selector) { out[name] = null; continue; }
			const pick = (el) => f.attr ? el.getAttribute(f.attr) : (el.innerText || el.value || '').trim();
			if (f.all) {
				out[name] = Array.from(document.querySelectorAll(f.selector)).map(pick);
			} else {
				const el = document.querySelector(f.selector);
				out[name] = el ? pick(el) : null;
			}
		} catch (e) { out[name] = null; }
	}
	return out;
}"""

# Fill each {selector, value, type?} field (dispatching input+change so reactive
# frameworks observe it), then optionally click a submit selector.
_FILL_JS = """(spec) => {
	const results = [];
	for (const f of (spec.fields || [])) {
		try {
			const el = document.querySelector(f.selector);
			if (!el) { results.push({ selector: f.selector, ok: false, reason: 'not found' }); continue; }
			const t = (f.type || '').toLowerCase();
			if (t === 'check' || t === 'checkbox' || el.type === 'checkbox' || el.type === 'radio') {
				el.checked = Boolean(f.value);
			} else {
				el.value = f.value == null ? '' : String(f.value);
			}
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
			results.push({ selector: f.selector, ok: true });
		} catch (e) { results.push({ selector: f.selector, ok: false, reason: String(e) }); }
	}
	let submitted = false;
	if (spec.submit) {
		try { const s = document.querySelector(spec.submit); if (s) { s.click(); submitted = true; } } catch (e) {}
	}
	return { filled: results, submitted };
}"""

# Draw a labeled box over each visible interactive element and return the
# annotation list. Boxes are position:fixed → aligned to the viewport (so pair
# with full_page:false for a pixel-accurate overlay).
_ANNOTATE_JS = """(opts) => {
	const max = (opts && opts.max) || 100;
	const sel = 'a[href], button, input, select, textarea, [role=button], [onclick], [contenteditable=\\"true\\"]';
	const old = document.getElementById('recoder-annot-overlay');
	if (old) old.remove();
	const overlay = document.createElement('div');
	overlay.id = 'recoder-annot-overlay';
	overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
	const ann = [];
	const els = Array.from(document.querySelectorAll(sel)).filter((el) => {
		const r = el.getBoundingClientRect();
		return r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
	}).slice(0, max);
	els.forEach((el, i) => {
		const r = el.getBoundingClientRect();
		const box = document.createElement('div');
		box.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:2px solid #FF005C;box-sizing:border-box;';
		const label = document.createElement('div');
		label.textContent = String(i);
		label.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + Math.max(0, r.top - 14) + 'px;background:#FF005C;color:#fff;font:11px monospace;padding:0 3px;';
		overlay.appendChild(box);
		overlay.appendChild(label);
		ann.push({ index: i, tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 80), rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
	});
	document.body.appendChild(overlay);
	return ann;
}"""


async def _evaluate(session, func_js, arg):
	"""Evaluate a pure ``(arg) => ...`` JS function in the page over CDP.

	The argument is JSON-embedded into the call expression (never string-formatted
	into the function body), and ``returnByValue`` marshals the result back. Returns
	the deserialized value, or ``None`` when the page returned nothing.
	"""
	import json as _json

	cdp = await session.get_or_create_cdp_session()
	expression = f'({func_js})({_json.dumps(arg)})'
	result = await cdp.cdp_client.send.Runtime.evaluate(
		params={'expression': expression, 'returnByValue': True, 'awaitPromise': True},
		session_id=cdp.session_id,
	)
	if result and 'result' in result and 'value' in result['result']:
		return result['result']['value']
	return None


def _select_llm():
	"""Pick a chat model from whichever provider key is present in the env.

	Returns ``(llm, None)`` when a provider key is configured, else ``(None, reason)``
	so ``/run_task`` degrades truthfully instead of pretending to run an agent. The
	model is overridable via ``BROWSER_USE_MODEL``. Imports are lazy — this file
	stays importable on a bare interpreter.
	"""
	model = os.getenv('BROWSER_USE_MODEL')
	if os.getenv('OPENAI_API_KEY'):
		from browser_use.llm.openai.chat import ChatOpenAI

		return ChatOpenAI(model=model or 'gpt-4o-mini'), None
	if os.getenv('ANTHROPIC_API_KEY'):
		from browser_use.llm.anthropic.chat import ChatAnthropic

		return ChatAnthropic(model=model or 'claude-3-5-sonnet-20241022'), None
	if os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY'):
		from browser_use.llm.google.chat import ChatGoogle

		return ChatGoogle(model=model or 'gemini-2.0-flash'), None
	if os.getenv('GROQ_API_KEY'):
		from browser_use.llm.groq.chat import ChatGroq

		return ChatGroq(model=model or 'llama-3.3-70b-versatile'), None
	return None, 'no LLM key configured (set OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY / GROQ_API_KEY)'


async def extract_structured(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error
	fields = payload.get('fields') if isinstance(payload, dict) else None
	if not isinstance(fields, dict) or not fields:
		return web.json_response(
			{'error': 'expected JSON body {url, fields: {name: selector|{selector,attr?,all?}}}'},
			status=400,
		)

	async def _run(session):
		await session.navigate_to(url)
		data = await _evaluate(session, _EXTRACT_JS, fields)
		return web.json_response({'url': url, 'data': data if data is not None else {}})

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'extract_structured failed: {exc}'}, status=500)


async def run_task(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	task = payload.get('task') if isinstance(payload, dict) else None
	if not isinstance(task, str) or not task:
		return web.json_response({'error': 'expected JSON body {task: str}'}, status=400)

	llm, llm_reason = _select_llm()
	if llm is None:
		return web.json_response({'error': f'browser task run unavailable: {llm_reason}'}, status=503)

	try:
		max_steps = int(payload.get('max_steps', 25))
	except (TypeError, ValueError):
		max_steps = 25

	try:
		from browser_use import Agent
		from browser_use.browser import BrowserProfile

		agent = Agent(task=task, llm=llm, browser_profile=BrowserProfile(headless=True))
		history = await agent.run(max_steps=max_steps)
		return web.json_response(
			{
				'task': task,
				'done': history.is_done(),
				'success': history.is_successful(),
				'steps': history.number_of_steps(),
				'final_result': history.final_result(),
				'urls': [u for u in history.urls() if u],
			}
		)
	except Exception as exc:  # pragma: no cover - runtime agent failure
		return web.json_response({'error': f'run_task failed: {exc}'}, status=500)


async def screenshot_annotate(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error
	full_page = bool(payload.get('full_page', False))
	try:
		max_elements = int(payload.get('max_elements', 100))
	except (TypeError, ValueError):
		max_elements = 100

	async def _run(session):
		await session.navigate_to(url)
		annotations = await _evaluate(session, _ANNOTATE_JS, {'max': max_elements})
		data = await session.take_screenshot(full_page=full_page)
		return web.json_response(
			{
				'url': url,
				'format': 'png',
				'screenshot_base64': base64.b64encode(data).decode('ascii'),
				'annotations': annotations if isinstance(annotations, list) else [],
			}
		)

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'screenshot_annotate failed: {exc}'}, status=500)


async def fill_form(request):
	available, reason, _ = _probe_capability()
	if not available:
		return _degraded_response(reason)

	payload = await request.json()
	url, error = _read_url(payload)
	if error is not None:
		return error
	fields = payload.get('fields') if isinstance(payload, dict) else None
	if not isinstance(fields, list) or not fields:
		return web.json_response(
			{'error': 'expected JSON body {url, fields: [{selector, value, type?}], submit?}'},
			status=400,
		)
	submit = payload.get('submit') if isinstance(payload.get('submit'), str) else None

	async def _run(session):
		await session.navigate_to(url)
		outcome = await _evaluate(session, _FILL_JS, {'fields': fields, 'submit': submit})
		final_url = url
		try:
			tabs = await session.get_tabs()
			if tabs:
				final_url = getattr(tabs[0], 'url', url)
		except Exception:  # pragma: no cover - best-effort post-submit url
			pass
		body = {'url': url, 'final_url': final_url}
		if isinstance(outcome, dict):
			body.update(outcome)
		return web.json_response(body)

	try:
		return await _with_session(_run)
	except Exception as exc:  # pragma: no cover - runtime browser failure
		return web.json_response({'error': f'fill_form failed: {exc}'}, status=500)


def build_app():
	"""Construct the aiohttp application. Pure — no I/O, safe to import."""
	app = web.Application()
	app.add_routes(
		[
			web.get('/health', health),
			web.post('/navigate', navigate),
			web.post('/extract', extract),
			web.post('/screenshot', screenshot),
			web.post('/extract_structured', extract_structured),
			web.post('/run_task', run_task),
			web.post('/screenshot_annotate', screenshot_annotate),
			web.post('/fill_form', fill_form),
		]
	)
	return app


if __name__ == '__main__':  # pragma: no cover
	host = os.getenv('BROWSER_SERVICE_HOST', '127.0.0.1')
	port = int(os.getenv('PORT', '8896'))
	web.run_app(build_app(), host=host, port=port)
