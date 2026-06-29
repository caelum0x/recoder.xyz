#!/usr/bin/env node

/**
 * Tests for recoder-api.mjs — the Recoder public-API client skill.
 *
 * Run with:
 *   node --test recoder-api.test.mjs
 *
 * Uses Node's built-in test runner (node:test) and assert/strict.
 * The script is now importable with no import-time side effects, so we
 * test the real functions directly (with an injected fetch) instead of
 * re-implementing them. CLI behavior is covered via subprocess smoke tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  resolveConfig,
  parseArgs,
  apiRequest,
  createProject,
  sendPrompt,
  getPreview,
  listProjects,
  publishProject,
  runCli,
  ConfigError,
  ApiError,
} from './recoder-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, 'recoder-api.mjs');

const VALID_KEY = 'sk_live_test_1234567890';
const CFG = { apiKey: VALID_KEY, apiUrl: 'https://api.recoder.xyz' };

// ── Helpers ────────────────────────────────────────────────────────

/** Build a fake fetch that records the call and returns a canned response. */
function mockFetch({ ok = true, status = 200, json } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      text: async () => (json === undefined ? '' : JSON.stringify(json)),
    };
  };
  fn.calls = calls;
  return fn;
}

/** Run the CLI as a subprocess. Returns { code, stdout, stderr }. */
function runSubprocess(args = [], envOverrides = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...envOverrides };
    if (!('RECODER_API_KEY' in envOverrides)) delete env.RECODER_API_KEY;
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env, timeout: 10_000 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (error.code ?? 1) : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}

/** Capture runCli output without spawning a process. */
async function captureCli(argv, env = {}, fetchImpl) {
  const out = [];
  const err = [];
  const code = await runCli(argv, {
    env,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    fetchImpl,
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

// ── resolveConfig ──────────────────────────────────────────────────

describe('resolveConfig', () => {
  it('throws ConfigError when the key is missing', () => {
    assert.throws(() => resolveConfig({}), ConfigError);
    assert.throws(() => resolveConfig({ RECODER_API_KEY: '   ' }), ConfigError);
  });

  it('throws ConfigError when the key does not start with sk_', () => {
    assert.throws(
      () => resolveConfig({ RECODER_API_KEY: 'pk_wrongprefix' }),
      /start with "sk_"/,
    );
  });

  it('accepts a valid sk_ key and trims it', () => {
    const cfg = resolveConfig({ RECODER_API_KEY: `  ${VALID_KEY}  ` });
    assert.equal(cfg.apiKey, VALID_KEY);
  });

  it('defaults the base URL to https://api.recoder.xyz', () => {
    const cfg = resolveConfig({ RECODER_API_KEY: VALID_KEY });
    assert.equal(cfg.apiUrl, 'https://api.recoder.xyz');
  });

  it('honors RECODER_API_URL and strips trailing slashes', () => {
    const cfg = resolveConfig({
      RECODER_API_KEY: VALID_KEY,
      RECODER_API_URL: 'http://localhost:3001///',
    });
    assert.equal(cfg.apiUrl, 'http://localhost:3001');
  });
});

// ── parseArgs ──────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses a single --key value pair', () => {
    assert.deepEqual(parseArgs(['--name', 'MyProject']), { name: 'MyProject' });
  });

  it('parses multiple --key value pairs', () => {
    assert.deepEqual(parseArgs(['--project', 'abc123', '--prompt', 'Add dark mode']), {
      project: 'abc123',
      prompt: 'Add dark mode',
    });
  });

  it('treats a flag without a following value as boolean true', () => {
    assert.deepEqual(parseArgs(['--verbose']), { verbose: true });
  });

  it('treats a flag followed by another flag as boolean true', () => {
    assert.deepEqual(parseArgs(['--verbose', '--name', 'test']), {
      verbose: true,
      name: 'test',
    });
  });

  it('returns an empty object for no arguments', () => {
    assert.deepEqual(parseArgs([]), {});
  });

  it('ignores positional arguments that do not start with --', () => {
    assert.deepEqual(parseArgs(['positional', '--name', 'test']), { name: 'test' });
  });

  it('does not mutate the input array', () => {
    const input = ['--name', 'x'];
    const snapshot = [...input];
    parseArgs(input);
    assert.deepEqual(input, snapshot);
  });
});

// ── apiRequest (contract correctness) ──────────────────────────────

describe('apiRequest', () => {
  it('sends Authorization: Bearer <key>, not X-API-Key', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: { ok: 1 } } });
    await apiRequest(CFG, 'GET', '/projects', { fetchImpl });
    const { init } = fetchImpl.calls[0];
    assert.equal(init.headers.Authorization, `Bearer ${VALID_KEY}`);
    assert.equal(init.headers['X-API-Key'], undefined);
  });

  it('targets the /api/v1 base path', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: {} } });
    await apiRequest(CFG, 'GET', '/projects', { fetchImpl });
    assert.equal(fetchImpl.calls[0].url, 'https://api.recoder.xyz/api/v1/projects');
  });

  it('unwraps the { success, data } envelope', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: { id: 'p1' } } });
    const result = await apiRequest(CFG, 'GET', '/projects/p1', { fetchImpl });
    assert.deepEqual(result, { id: 'p1' });
  });

  it('serializes a JSON body and sets Content-Type', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: {} } });
    await apiRequest(CFG, 'POST', '/projects', { body: { name: 'X' }, fetchImpl });
    const { init } = fetchImpl.calls[0];
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { name: 'X' });
  });

  it('throws ApiError carrying the server error code on non-2xx', async () => {
    const fetchImpl = mockFetch({
      ok: false,
      status: 401,
      json: { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' } },
    });
    await assert.rejects(
      () => apiRequest(CFG, 'GET', '/projects', { fetchImpl }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.code, 'INVALID_API_KEY');
        assert.equal(err.status, 401);
        assert.match(err.message, /Invalid or expired/);
        return true;
      },
    );
  });

  it('surfaces retryAfter from rate-limit errors', async () => {
    const fetchImpl = mockFetch({
      ok: false,
      status: 429,
      json: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: { retryAfter: 30 } },
      },
    });
    await assert.rejects(
      () => apiRequest(CFG, 'POST', '/projects', { body: {}, fetchImpl }),
      (err) => {
        assert.equal(err.code, 'RATE_LIMIT_EXCEEDED');
        assert.equal(err.retryAfter, 30);
        return true;
      },
    );
  });

  it('wraps network failures in a truthful ApiError', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(
      () => apiRequest(CFG, 'GET', '/projects', { fetchImpl }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.match(err.message, /Could not reach Recoder API/);
        return true;
      },
    );
  });

  it('falls back to HTTP status when the error body is not JSON', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 502 });
    await assert.rejects(
      () => apiRequest(CFG, 'GET', '/projects', { fetchImpl }),
      /HTTP 502/,
    );
  });
});

// ── Commands (response-shape correctness) ──────────────────────────

describe('createProject', () => {
  it('POSTs name + template and maps the project response', async () => {
    const fetchImpl = mockFetch({
      json: { success: true, data: { id: 'proj_1', name: 'My App', status: 'running', template: 'react', previewUrl: 'http://preview' } },
    });
    const out = await createProject(CFG, { name: 'My App' }, fetchImpl);
    const { init } = fetchImpl.calls[0];
    assert.deepEqual(JSON.parse(init.body), { name: 'My App', template: 'react' });
    assert.deepEqual(out, {
      projectId: 'proj_1',
      name: 'My App',
      status: 'running',
      template: 'react',
      previewUrl: 'http://preview',
    });
  });

  it('throws ConfigError when --name is missing', async () => {
    await assert.rejects(() => createProject(CFG, {}, mockFetch()), ConfigError);
  });
});

describe('sendPrompt', () => {
  it('returns taskId + status from the queued (202) response', async () => {
    // Real backend returns { taskId, status: 'queued' } — NOT messageId/sent.
    const fetchImpl = mockFetch({
      status: 202,
      json: { success: true, data: { taskId: 'task_abc', status: 'queued' } },
    });
    const out = await sendPrompt(CFG, { project: 'proj_1', prompt: 'Add dark mode' }, fetchImpl);
    assert.deepEqual(out, { taskId: 'task_abc', status: 'queued' });
    assert.match(fetchImpl.calls[0].url, /\/projects\/proj_1\/prompt$/);
  });

  it('includes an optional model field', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: { taskId: 't', status: 'queued' } } });
    await sendPrompt(CFG, { project: 'p', prompt: 'hi', model: 'anthropic/claude-sonnet-4.5' }, fetchImpl);
    assert.equal(JSON.parse(fetchImpl.calls[0].init.body).model, 'anthropic/claude-sonnet-4.5');
  });

  it('requires --project and --prompt', async () => {
    await assert.rejects(() => sendPrompt(CFG, { project: 'p' }, mockFetch()), ConfigError);
    await assert.rejects(() => sendPrompt(CFG, { prompt: 'x' }, mockFetch()), ConfigError);
  });

  it('url-encodes the project id', async () => {
    const fetchImpl = mockFetch({ json: { success: true, data: { taskId: 't', status: 'queued' } } });
    await sendPrompt(CFG, { project: 'a/b', prompt: 'x' }, fetchImpl);
    assert.match(fetchImpl.calls[0].url, /\/projects\/a%2Fb\/prompt$/);
  });
});

describe('getPreview', () => {
  it('maps preview + published URLs, defaulting to null', async () => {
    const fetchImpl = mockFetch({
      json: { success: true, data: { id: 'p', name: 'N', status: 'running', previewUrl: 'http://prev' } },
    });
    const out = await getPreview(CFG, { project: 'p' }, fetchImpl);
    assert.deepEqual(out, {
      projectId: 'p',
      name: 'N',
      status: 'running',
      previewUrl: 'http://prev',
      publishedUrl: null,
    });
  });
});

describe('listProjects', () => {
  it('returns the projects array from the envelope', async () => {
    const fetchImpl = mockFetch({
      json: { success: true, data: { projects: [{ id: 'p1' }, { id: 'p2' }] } },
    });
    const out = await listProjects(CFG, {}, fetchImpl);
    assert.deepEqual(out, [{ id: 'p1' }, { id: 'p2' }]);
  });
});

describe('publishProject', () => {
  it('maps url/slug/publishedAt', async () => {
    const fetchImpl = mockFetch({
      json: { success: true, data: { url: 'https://web.recoder.xyz/my-app', slug: 'my-app', publishedAt: '2026-02-04T12:00:00.000Z' } },
    });
    const out = await publishProject(CFG, { project: 'p' }, fetchImpl);
    assert.deepEqual(out, {
      url: 'https://web.recoder.xyz/my-app',
      slug: 'my-app',
      publishedAt: '2026-02-04T12:00:00.000Z',
    });
  });
});

// ── runCli (in-process, with injected fetch) ───────────────────────

describe('runCli', () => {
  it('returns 1 and usage for an unknown command', async () => {
    const { code, stderr } = await captureCli(['bogus'], { RECODER_API_KEY: VALID_KEY });
    assert.equal(code, 1);
    assert.match(stderr, /Usage:/);
  });

  it('returns 1 with a config error when the key is missing', async () => {
    const { code, stderr } = await captureCli(['list'], {});
    assert.equal(code, 1);
    assert.match(stderr, /RECODER_API_KEY is not set/);
  });

  it('returns 1 with a config error when the key has the wrong prefix', async () => {
    const { code, stderr } = await captureCli(['list'], { RECODER_API_KEY: 'nope' });
    assert.equal(code, 1);
    assert.match(stderr, /start with "sk_"/);
  });

  it('runs a command end-to-end and prints JSON on success', async () => {
    const fetchImpl = mockFetch({
      json: { success: true, data: { projects: [{ id: 'p1', name: 'A', status: 'running' }] } },
    });
    const { code, stdout } = await captureCli(['list'], { RECODER_API_KEY: VALID_KEY }, fetchImpl);
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(stdout), [{ id: 'p1', name: 'A', status: 'running' }]);
  });

  it('surfaces the API error code in the CLI message', async () => {
    const fetchImpl = mockFetch({
      ok: false,
      status: 401,
      json: { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' } },
    });
    const { code, stderr } = await captureCli(['list'], { RECODER_API_KEY: VALID_KEY }, fetchImpl);
    assert.equal(code, 1);
    assert.match(stderr, /INVALID_API_KEY/);
  });
});

// ── CLI subprocess smoke tests (no import-time side effects) ───────

describe('CLI subprocess', () => {
  it('exits 1 and mentions RECODER_API_KEY when key is unset', async () => {
    const { code, stderr } = await runSubprocess(['list']);
    assert.equal(code, 1);
    assert.match(stderr, /RECODER_API_KEY/);
  });

  it('prints usage and exits 1 with no arguments', async () => {
    const { code, stderr } = await runSubprocess([], { RECODER_API_KEY: VALID_KEY });
    assert.equal(code, 1);
    assert.match(stderr, /Usage:/);
    assert.match(stderr, /create/);
    assert.match(stderr, /publish/);
  });

  it('prints usage and exits 1 for an invalid command', async () => {
    const { code, stderr } = await runSubprocess(['notacommand'], { RECODER_API_KEY: VALID_KEY });
    assert.equal(code, 1);
    assert.match(stderr, /Usage:/);
  });

  it('shows usage before checking the key for an unknown command', async () => {
    // Unknown command is rejected regardless of key presence.
    const { code, stderr } = await runSubprocess(['notacommand']);
    assert.equal(code, 1);
    assert.match(stderr, /Usage:/);
  });
});
