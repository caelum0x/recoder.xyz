'use strict';
/**
 * Tests for the shared Recoder MCP core helpers.
 *
 * These cover the load-bearing behavior of the live MCP surfaces:
 *  - credential resolution (pk_/sk_ key vs. bearer session token)
 *  - auth header construction for each backend
 *  - {success,error} envelope parsing without crashing on non-JSON
 *  - truthful "not configured" detection
 *  - HMAC signature format
 *  - Daytona request body field names (the real bug: image/auto_stop_interval)
 *
 * Run: node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const core = require('../lib/recoder-mcp-core');

// ── Credential resolution ──────────────────────────────────────────────────

test('resolveCredentials: pk_/sk_ pair becomes the Python API key, not a bearer', () => {
  const creds = core.resolveCredentials({ apiToken: 'pk_abc:sk_def' });
  assert.equal(creds.pythonApiKey, 'pk_abc:sk_def');
  assert.equal(creds.platformToken, '', 'a pk/sk pair must not also be used as a bearer token');
});

test('resolveCredentials: a non-pk/sk RECODER_API_TOKEN is treated as a bearer token', () => {
  const creds = core.resolveCredentials({ apiToken: 'eyJsessiontoken' });
  assert.equal(creds.pythonApiKey, '');
  assert.equal(creds.platformToken, 'eyJsessiontoken');
});

test('resolveCredentials: explicit session token wins and is URL-decoded', () => {
  const creds = core.resolveCredentials({ sessionToken: 'abc%3Ddef%2B1' });
  assert.equal(creds.platformToken, 'abc=def+1');
});

test('resolveCredentials: malformed percent-encoding does not throw, falls back to raw', () => {
  const creds = core.resolveCredentials({ sessionToken: '%E0%A4%A' }); // invalid sequence
  assert.equal(creds.platformToken, '%E0%A4%A');
});

test('resolveCredentials: no env yields no credentials', () => {
  const creds = core.resolveCredentials({});
  assert.equal(creds.pythonApiKey, '');
  assert.equal(creds.platformToken, '');
});

test('isRecoderApiKeyPair: only pk_:sk_ shapes match', () => {
  assert.equal(core.isRecoderApiKeyPair('pk_1:sk_2'), true);
  assert.equal(core.isRecoderApiKeyPair('sk_2:pk_1'), false);
  assert.equal(core.isRecoderApiKeyPair('plain-token'), false);
  assert.equal(core.isRecoderApiKeyPair(''), false);
  assert.equal(core.isRecoderApiKeyPair(null), false);
});

// ── Auth header construction ───────────────────────────────────────────────

test('buildPythonApiHeaders: pk/sk pair uses x-api-key, never Authorization', () => {
  const creds = core.resolveCredentials({ apiToken: 'pk_a:sk_b' });
  const headers = core.buildPythonApiHeaders(creds, { 'Content-Type': 'application/json' });
  assert.equal(headers['x-api-key'], 'pk_a:sk_b');
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers['Content-Type'], 'application/json', 'extra headers are preserved');
});

test('buildPythonApiHeaders: session token falls back to Authorization bearer', () => {
  const creds = core.resolveCredentials({ sessionToken: 'tok123' });
  const headers = core.buildPythonApiHeaders(creds);
  assert.equal(headers.Authorization, 'Bearer tok123');
  assert.equal(headers['x-api-key'], undefined);
});

test('buildPlatformHeaders: only sets Authorization when a platform token exists', () => {
  assert.deepEqual(core.buildPlatformHeaders(core.resolveCredentials({})), {});
  const creds = core.resolveCredentials({ sessionToken: 'tok' });
  assert.equal(core.buildPlatformHeaders(creds).Authorization, 'Bearer tok');
});

test('hasPythonApiAuth / hasPlatformAuth reflect available credentials', () => {
  const none = core.resolveCredentials({});
  assert.equal(core.hasPythonApiAuth(none), false);
  assert.equal(core.hasPlatformAuth(none), false);

  const keyOnly = core.resolveCredentials({ apiToken: 'pk_a:sk_b' });
  assert.equal(core.hasPythonApiAuth(keyOnly), true);
  assert.equal(core.hasPlatformAuth(keyOnly), false, 'a pk/sk key is not a control-plane bearer token');

  const sessionOnly = core.resolveCredentials({ sessionToken: 'tok' });
  assert.equal(core.hasPythonApiAuth(sessionOnly), true);
  assert.equal(core.hasPlatformAuth(sessionOnly), true);
});

// ── Envelope parsing (never crash, never fake success) ─────────────────────

function fakeResponse({ ok, status, body }) {
  return { ok, status, text: async () => body };
}

test('readJsonResponse: parses a success envelope', async () => {
  const parsed = await core.readJsonResponse(
    fakeResponse({ ok: true, status: 200, body: JSON.stringify({ success: true, data: { tasks: [] } }) }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 200);
  assert.deepEqual(parsed.data, { success: true, data: { tasks: [] } });
});

test('readJsonResponse: non-JSON body (HTML 502) does not throw, data is null', async () => {
  const parsed = await core.readJsonResponse(
    fakeResponse({ ok: false, status: 502, body: '<html>Bad Gateway</html>' }),
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 502);
  assert.equal(parsed.data, null);
  assert.match(parsed.text, /Bad Gateway/);
});

test('readJsonResponse: empty body yields null data', async () => {
  const parsed = await core.readJsonResponse(fakeResponse({ ok: true, status: 204, body: '' }));
  assert.equal(parsed.data, null);
});

test('extractApiError: reads Recoder {success,error:{message}} envelope', () => {
  const msg = core.extractApiError({
    ok: false, status: 401,
    data: { success: false, error: { code: 'unauthorized', message: 'Invalid session token' } },
    text: '{"...":"..."}',
  });
  assert.equal(msg, 'Invalid session token');
});

test('extractApiError: reads {message} and {detail} shapes', () => {
  assert.equal(core.extractApiError({ status: 400, data: { message: 'bad request' }, text: '' }), 'bad request');
  assert.equal(core.extractApiError({ status: 422, data: { detail: 'validation failed' }, text: '' }), 'validation failed');
});

test('extractApiError: falls back to raw text then to HTTP status', () => {
  assert.equal(core.extractApiError({ status: 502, data: null, text: 'Bad Gateway' }), 'Bad Gateway');
  assert.equal(core.extractApiError({ status: 503, data: null, text: '' }), 'HTTP 503');
});

// ── Daytona request shape (the real field-name bug) ────────────────────────

test('buildDaytonaCreateBody: uses snapshot + autoStopInterval, NOT image/auto_stop_interval', () => {
  const body = core.buildDaytonaCreateBody({ snapshot: 'img:1', autoStopInterval: 10 });
  assert.equal(body.snapshot, 'img:1');
  assert.equal(body.autoStopInterval, 10);
  assert.equal(body.public, true);
  assert.equal('image' in body, false, 'backend expects "snapshot", not "image"');
  assert.equal('auto_stop_interval' in body, false, 'backend expects camelCase "autoStopInterval"');
});

test('buildDaytonaCreateBody: applies safe defaults', () => {
  const body = core.buildDaytonaCreateBody();
  assert.equal(body.snapshot, 'daytonaio/sandbox:0.5.0-slim');
  assert.equal(body.autoStopInterval, 10);
  assert.equal(body.public, true);
});

test('normalizeDaytonaApiUrl: appends /api and validates', () => {
  assert.equal(core.normalizeDaytonaApiUrl('http://127.0.0.1:3900'), 'http://127.0.0.1:3900/api');
  assert.equal(core.normalizeDaytonaApiUrl('http://127.0.0.1:3900/api/'), 'http://127.0.0.1:3900/api');
  assert.throws(() => core.normalizeDaytonaApiUrl('not a url'), /Invalid RECODER_DAYTONA_URL/);
});

test('isLocalUrl: detects loopback hosts', () => {
  assert.equal(core.isLocalUrl('http://localhost:3001'), true);
  assert.equal(core.isLocalUrl('http://127.0.0.1:3001'), true);
  assert.equal(core.isLocalUrl('https://api.recoder.xyz'), false);
  assert.equal(core.isLocalUrl('garbage'), false);
});

// ── HMAC signature format ──────────────────────────────────────────────────

test('signRequest: no secret -> no signature headers (signing is optional)', () => {
  assert.deepEqual(core.signRequest({ method: 'GET', url: 'http://x/y', secret: '' }), {});
});

test('signRequest: produces deterministic HMAC over METHOD\\nPATH\\nTS\\nBODY', () => {
  const secret = 'shhh';
  const timestamp = '2026-01-01T00:00:00.000Z';
  const body = '{"task":"hi"}';
  const out = core.signRequest({ method: 'post', url: 'https://docker.recoder.xyz/api/a2a/tasks', body, secret, timestamp });

  assert.equal(out['X-Recoder-A2A-Timestamp'], timestamp);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`POST\n/api/a2a/tasks\n${timestamp}\n${body}`)
    .digest('hex');
  assert.equal(out['X-Recoder-A2A-Signature'], expected);
  assert.match(out['X-Recoder-A2A-Signature'], /^[0-9a-f]{64}$/, 'signature is a 64-char hex sha256');
});

test('signRequest: signature changes when the body changes (tamper-evident)', () => {
  const base = { method: 'POST', url: 'https://x/api/a2a/tasks', secret: 's', timestamp: 'T' };
  const a = core.signRequest({ ...base, body: 'a' })['X-Recoder-A2A-Signature'];
  const b = core.signRequest({ ...base, body: 'b' })['X-Recoder-A2A-Signature'];
  assert.notEqual(a, b);
});
