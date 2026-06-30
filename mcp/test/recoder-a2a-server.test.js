'use strict';
/**
 * Integration tests for recoder-a2a-server.js driven over real MCP stdio.
 *
 * Asserts the load-bearing behavior of the live Claude Code MCP server:
 *  - MCP handshake (initialize + tools/list) exposes the tool set
 *  - not-configured tools return a truthful "not configured" message (no crash)
 *  - recoder_sandbox_exec builds the Daytona request with the correct field
 *    names (snapshot/autoStopInterval) against a fake Daytona backend
 *
 * Run: node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'recoder-a2a-server.js');

// A minimal MCP client over the server's stdio.
function startServer(env) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const waiters = new Map();
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      }
    }
  });

  function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }
  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for id ${id}`)), 8000);
      waiters.set(id, (m) => { clearTimeout(t); resolve(m); });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }
  function notify(method, params) { send({ jsonrpc: '2.0', method, params }); }

  return { child, request, notify, close: () => child.kill() };
}

async function handshake(env) {
  const s = startServer(env);
  await s.request(1, 'initialize', {});
  s.notify('notifications/initialized', {});
  return s;
}

// Capture the server's startup banner (written to stderr) which reports the
// resolved API + A2A bridge URLs. Returns once the banner line is seen so the
// URL-resolution assertions don't depend on the WS connection succeeding.
function resolvedUrls(env) {
  return new Promise((resolve, reject) => {
    // Avoid inheriting the test harness's own RECODER_* env (e.g. real tokens in
    // .mcp.json are not in process.env, but PORT/RECODER_USE_CLOUD could be) so
    // each case observes exactly the env it sets. Strip RECODER_/PORT keys first.
    const baseEnv = { ...process.env };
    for (const k of Object.keys(baseEnv)) {
      if (k.startsWith('RECODER_') || k === 'PORT') delete baseEnv[k];
    }
    const child = spawn(process.execPath, [SERVER], {
      env: { ...baseEnv, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let err = '';
    const t = setTimeout(() => { child.kill(); reject(new Error('timeout waiting for banner')); }, 8000);
    child.stderr.on('data', (chunk) => {
      err += chunk.toString();
      const m = err.match(/\[recoder-a2a\] API: (\S+) \| A2A: (\S+)/);
      if (m) {
        clearTimeout(t);
        child.kill();
        resolve({ apiUrl: m[1], a2aUrl: m[2] });
      }
    });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

test('URL resolution: defaults to LOCAL loopback bridge when no env is set', async () => {
  const { apiUrl, a2aUrl } = await resolvedUrls({});
  assert.equal(apiUrl, 'http://127.0.0.1:3100', `default API should be local loopback, got ${apiUrl}`);
  assert.equal(a2aUrl, 'ws://127.0.0.1:3100/agent-bridge', `default bridge should be local ws, got ${a2aUrl}`);
  assert.doesNotMatch(a2aUrl, /recoder\.xyz/, 'default bridge must NOT point at prod');
});

test('URL resolution: RECODER_BACKEND_PORT overrides the local port', async () => {
  const { apiUrl, a2aUrl } = await resolvedUrls({ RECODER_BACKEND_PORT: '4321' });
  assert.equal(apiUrl, 'http://127.0.0.1:4321');
  assert.equal(a2aUrl, 'ws://127.0.0.1:4321/agent-bridge');
});

test('URL resolution: RECODER_USE_CLOUD=true opts into the prod bridge (cloud not broken)', async () => {
  const { apiUrl, a2aUrl } = await resolvedUrls({ RECODER_USE_CLOUD: 'true' });
  assert.equal(apiUrl, 'https://api.recoder.xyz');
  assert.equal(a2aUrl, 'wss://docker.recoder.xyz/agent-bridge');
});

test('URL resolution: explicit RECODER_A2A_URL takes precedence over the local default', async () => {
  const { a2aUrl } = await resolvedUrls({ RECODER_A2A_URL: 'wss://bridge.example.com/agent-bridge' });
  assert.equal(a2aUrl, 'wss://bridge.example.com/agent-bridge');
});

test('URL resolution: RECODER_DOCKER_URL derives the bridge from the explicit base', async () => {
  const { apiUrl, a2aUrl } = await resolvedUrls({ RECODER_DOCKER_URL: 'http://10.0.0.5:9000' });
  // API_URL is independent of DOCKER_URL and falls back to local when not set.
  assert.equal(apiUrl, 'http://127.0.0.1:3100');
  assert.equal(a2aUrl, 'ws://10.0.0.5:9000/agent-bridge');
});

function textOf(resp) {
  return resp.result?.content?.map((c) => c.text).join('\n') || '';
}

test('initialize + tools/list exposes the recoder tool set', async () => {
  const s = await handshake({ RECODER_A2A_URL: 'ws://127.0.0.1:1/none' });
  try {
    const list = await s.request(2, 'tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    for (const expected of [
      'recoder_list_agents', 'recoder_list_tasks', 'recoder_send_task',
      'recoder_create_thread', 'recoder_get_thread', 'recoder_sandbox_exec',
      'recoder_inbox', 'recoder_task_respond',
      // Conductor coding-workspace surface (create / diff / merge).
      'recoder_workspace_create', 'recoder_workspace_diff', 'recoder_workspace_merge',
    ]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }
  } finally {
    s.close();
  }
});

test('recoder_create_thread without auth returns a truthful not-configured message', async () => {
  const s = await handshake({ RECODER_A2A_URL: 'ws://127.0.0.1:1/none', RECODER_API_TOKEN: '', RECODER_SESSION_TOKEN: '' });
  try {
    const resp = await s.request(3, 'tools/call', { name: 'recoder_create_thread', arguments: { prompt: 'hi' } });
    const text = textOf(resp);
    assert.match(text, /not configured/i);
    assert.doesNotMatch(text, /Thread: /, 'must not fake a created thread');
  } finally {
    s.close();
  }
});

test('recoder_list_tasks without platform auth returns a truthful not-configured message', async () => {
  const s = await handshake({ RECODER_A2A_URL: 'ws://127.0.0.1:1/none', RECODER_API_TOKEN: 'pk_a:sk_b', RECODER_SESSION_TOKEN: '' });
  try {
    // pk/sk is a Python API key, NOT a control-plane bearer -> list_tasks must report not configured.
    const resp = await s.request(4, 'tools/call', { name: 'recoder_list_tasks', arguments: {} });
    assert.match(textOf(resp), /not configured/i);
  } finally {
    s.close();
  }
});

test('recoder_sandbox_exec without DAYTONA_API_KEY returns a truthful error', async () => {
  const s = await handshake({ RECODER_A2A_URL: 'ws://127.0.0.1:1/none', DAYTONA_API_KEY: '' });
  try {
    const resp = await s.request(5, 'tools/call', { name: 'recoder_sandbox_exec', arguments: { command: 'echo hi' } });
    assert.match(textOf(resp), /DAYTONA_API_KEY not configured/);
  } finally {
    s.close();
  }
});

test('recoder_sandbox_exec builds Daytona create body with snapshot + autoStopInterval (not image/auto_stop_interval)', async () => {
  // Fake Daytona backend records the create request and returns a sandbox id.
  const received = [];
  const daytona = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, auth: req.headers['authorization'], body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url.endsWith('/sandbox') && req.method === 'POST') {
        res.end(JSON.stringify({ id: 'sbx_123' }));
      } else if (req.url.includes('/process/execute')) {
        res.end(JSON.stringify({ exitCode: 0, result: 'hello' }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise((r) => daytona.listen(0, '127.0.0.1', r));
  const { port } = daytona.address();

  const s = await handshake({
    RECODER_A2A_URL: 'ws://127.0.0.1:1/none',
    RECODER_DAYTONA_URL: `http://127.0.0.1:${port}/api`,
    DAYTONA_API_KEY: 'dyt_test',
  });
  try {
    const resp = await s.request(6, 'tools/call', { name: 'recoder_sandbox_exec', arguments: { command: 'echo hi' } });
    const text = textOf(resp);
    assert.match(text, /sbx_123/);
    assert.match(text, /hello/);

    const create = received.find((r) => r.method === 'POST' && r.url.endsWith('/sandbox'));
    assert.ok(create, 'expected a sandbox create call');
    assert.equal(create.auth, 'Bearer dyt_test');
    const createBody = JSON.parse(create.body);
    assert.equal(createBody.snapshot, 'daytonaio/sandbox:0.5.0-slim');
    assert.equal(createBody.autoStopInterval, 10);
    assert.equal('image' in createBody, false, 'must not send legacy "image" field');
    assert.equal('auto_stop_interval' in createBody, false, 'must not send snake_case field');

    const exec = received.find((r) => r.url.includes('/process/execute'));
    assert.ok(exec, 'expected an exec call');
    assert.equal(exec.auth, 'Bearer dyt_test');
  } finally {
    s.close();
    daytona.close();
  }
});
