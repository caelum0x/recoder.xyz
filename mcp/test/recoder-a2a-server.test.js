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
