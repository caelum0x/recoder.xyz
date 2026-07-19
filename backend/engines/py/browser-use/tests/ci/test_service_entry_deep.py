"""CI tests for the deep-browsing endpoints of ``service_entry.py``.

These cover the four capabilities added on top of the deterministic control plane
— schema-guided ``/extract_structured``, the LLM-driven ``/run_task``, annotated
``/screenshot_annotate``, and interactive ``/fill_form`` — with a focus on the two
properties that must always hold with NO real browser present:

  1. **Honest degrade.** When the capability probe reports no browser (chromium
     absent / import failed), every deep endpoint returns ``503`` with a truthful
     reason instead of a fabricated result. ``/run_task`` additionally ``503``s
     when no LLM provider key is configured.
  2. **Boundary validation.** With the browser available, a malformed body is
     rejected with ``400`` before any page work happens.

The success-shape mapping is exercised by stubbing the CDP ``_evaluate`` seam and
the ``_with_session`` lifecycle, so the JSON envelope is verified without a live
Chrome. The live-Chrome path is covered by the engine's own browser CI.
"""

import pathlib
import sys

import pytest
from aiohttp.test_utils import TestClient, TestServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

import service_entry as svc  # noqa: E402


class _FakeSession:
	"""A stand-in browser session: navigation is a no-op, tabs report a url."""

	def __init__(self, final_url='https://example.com/after'):
		self._final_url = final_url

	async def navigate_to(self, url, new_tab=False):
		return None

	async def get_tabs(self):
		class _Tab:
			url = self._final_url
			title = 'Example'

		return [_Tab()]

	async def take_screenshot(self, full_page=False):
		return b'\x89PNG-fake'


async def _client(app):
	client = TestClient(TestServer(app))
	await client.start_server()
	return client


def _force_available(monkeypatch):
	monkeypatch.setattr(svc, '_probe_capability', lambda: (True, None, '/usr/bin/chromium'))

	async def _with_fake_session(coro_factory):
		return await coro_factory(_FakeSession())

	monkeypatch.setattr(svc, '_with_session', _with_fake_session)


def _force_unavailable(monkeypatch):
	monkeypatch.setattr(svc, '_probe_capability', lambda: (False, 'no chromium found', None))


# --------------------------------------------------------------------------- #
# app wiring
# --------------------------------------------------------------------------- #

def test_build_app_registers_all_deep_routes():
	app = svc.build_app()
	paths = {route.resource.canonical for route in app.router.routes()}
	assert {'/extract_structured', '/run_task', '/screenshot_annotate', '/fill_form'} <= paths


# --------------------------------------------------------------------------- #
# honest degrade (no browser)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
	'path,body',
	[
		('/extract_structured', {'url': 'https://example.com', 'fields': {'title': 'h1'}}),
		('/screenshot_annotate', {'url': 'https://example.com'}),
		('/fill_form', {'url': 'https://example.com', 'fields': [{'selector': '#q', 'value': 'x'}]}),
		('/run_task', {'task': 'do a thing'}),
	],
)
async def test_deep_endpoints_degrade_503_without_browser(monkeypatch, path, body):
	_force_unavailable(monkeypatch)
	client = await _client(svc.build_app())
	try:
		resp = await client.post(path, json=body)
		assert resp.status == 503
		payload = await resp.json()
		assert 'error' in payload
	finally:
		await client.close()


async def test_run_task_degrades_when_no_llm_key(monkeypatch):
	# Browser available, but no provider key → truthful 503, never a faked run.
	monkeypatch.setattr(svc, '_probe_capability', lambda: (True, None, '/usr/bin/chromium'))
	for key in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY'):
		monkeypatch.delenv(key, raising=False)
	client = await _client(svc.build_app())
	try:
		resp = await client.post('/run_task', json={'task': 'summarize the page'})
		assert resp.status == 503
		assert 'LLM' in (await resp.json())['error']
	finally:
		await client.close()


def test_select_llm_reports_reason_without_keys(monkeypatch):
	for key in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY'):
		monkeypatch.delenv(key, raising=False)
	llm, reason = svc._select_llm()
	assert llm is None
	assert isinstance(reason, str) and reason


# --------------------------------------------------------------------------- #
# boundary validation (browser available)
# --------------------------------------------------------------------------- #

async def test_extract_structured_rejects_missing_fields(monkeypatch):
	_force_available(monkeypatch)
	client = await _client(svc.build_app())
	try:
		resp = await client.post('/extract_structured', json={'url': 'https://example.com'})
		assert resp.status == 400
	finally:
		await client.close()


async def test_fill_form_rejects_non_list_fields(monkeypatch):
	_force_available(monkeypatch)
	client = await _client(svc.build_app())
	try:
		resp = await client.post('/fill_form', json={'url': 'https://example.com', 'fields': {}})
		assert resp.status == 400
	finally:
		await client.close()


# --------------------------------------------------------------------------- #
# success-shape mapping (CDP seam stubbed)
# --------------------------------------------------------------------------- #

async def test_extract_structured_maps_data_envelope(monkeypatch):
	_force_available(monkeypatch)

	async def _fake_eval(session, func_js, arg):
		assert func_js is svc._EXTRACT_JS
		assert arg == {'title': 'h1'}
		return {'title': 'Hello'}

	monkeypatch.setattr(svc, '_evaluate', _fake_eval)
	client = await _client(svc.build_app())
	try:
		resp = await client.post(
			'/extract_structured', json={'url': 'https://example.com', 'fields': {'title': 'h1'}}
		)
		assert resp.status == 200
		assert await resp.json() == {'url': 'https://example.com', 'data': {'title': 'Hello'}}
	finally:
		await client.close()


async def test_fill_form_maps_outcome_and_final_url(monkeypatch):
	_force_available(monkeypatch)

	async def _fake_eval(session, func_js, arg):
		assert func_js is svc._FILL_JS
		return {'filled': [{'selector': '#q', 'ok': True}], 'submitted': True}

	monkeypatch.setattr(svc, '_evaluate', _fake_eval)
	client = await _client(svc.build_app())
	try:
		resp = await client.post(
			'/fill_form',
			json={'url': 'https://example.com', 'fields': [{'selector': '#q', 'value': 'x'}], 'submit': '#go'},
		)
		assert resp.status == 200
		payload = await resp.json()
		assert payload['submitted'] is True
		assert payload['filled'] == [{'selector': '#q', 'ok': True}]
		assert payload['final_url'] == 'https://example.com/after'
	finally:
		await client.close()


async def test_screenshot_annotate_returns_png_and_annotations(monkeypatch):
	_force_available(monkeypatch)

	async def _fake_eval(session, func_js, arg):
		assert func_js is svc._ANNOTATE_JS
		return [{'index': 0, 'tag': 'button', 'text': 'Go', 'rect': {'x': 1, 'y': 2, 'width': 3, 'height': 4}}]

	monkeypatch.setattr(svc, '_evaluate', _fake_eval)
	client = await _client(svc.build_app())
	try:
		resp = await client.post('/screenshot_annotate', json={'url': 'https://example.com'})
		assert resp.status == 200
		payload = await resp.json()
		assert payload['format'] == 'png'
		assert payload['screenshot_base64']
		assert payload['annotations'][0]['tag'] == 'button'
	finally:
		await client.close()
