'use strict';
/**
 * Integration tests for recoder-codex-adapter.js driven over real stdio JSON-RPC.
 *
 * We point the adapter at a throwaway local HTTP server and assert:
 *  - it sends the Authorization bearer header built from RECODER_API_TOKEN
 *  - it hits the correct backend path for each tool
 *  - recoder_send_task posts the expected JSON body
 *  - the not-configured paths return a truthful JSON-RPC error (no crash, no fake success)
 *
 * Run: node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ADAPTER = path.join(__dirname, '..', 'recoder-codex-adapter.js');

// Spin up a local backend that records the requests it receives.
function startBackend() {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        authorization: req.headers['authorization'] || null,
        contentType: req.headers['content-type'] || null,
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { ok: true } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, received, base: `http://127.0.0.1:${port}` });
    });
  });
}

// Drive the adapter: send one JSON-RPC request, resolve with the first response.
function callAdapter(env, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ADAPTER], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('adapter timed out'));
    }, 8000);

    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
      const nl = out.indexOf('\n');
      if (nl !== -1) {
        const line = out.slice(0, nl).trim();
        clearTimeout(timer);
        child.kill();
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      }
    });
    child.on('error', reject);
    child.stdin.write(JSON.stringify(request) + '\n');
  });
}

test('recoder_list_agents: GET /api/a2a/agents with bearer auth', async () => {
  const backend = await startBackend();
  try {
    const resp = await callAdapter(
      { RECODER_DOCKER_URL: backend.base, RECODER_API_TOKEN: 'sess-token-xyz' },
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'recoder_list_agents', arguments: {} } },
    );
    assert.equal(resp.id, 1);
    assert.deepEqual(resp.result, { success: true, data: { ok: true } });

    assert.equal(backend.received.length, 1);
    const r = backend.received[0];
    assert.equal(r.method, 'GET');
    assert.equal(r.url, '/api/a2a/agents');
    assert.equal(r.authorization, 'Bearer sess-token-xyz');
  } finally {
    backend.server.close();
  }
});

test('recoder_send_task: POST /api/a2a/tasks with task body + bearer auth', async () => {
  const backend = await startBackend();
  try {
    const resp = await callAdapter(
      { RECODER_DOCKER_URL: backend.base, RECODER_API_TOKEN: 'tok' },
      {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'recoder_send_task', arguments: { target_agent: 'claude_code', task: 'do the thing' } },
      },
    );
    assert.equal(resp.id, 2);
    assert.equal(resp.error, undefined);

    const r = backend.received[0];
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/api/a2a/tasks');
    assert.equal(r.authorization, 'Bearer tok');
    assert.equal(r.contentType, 'application/json');
    const sent = JSON.parse(r.body);
    assert.equal(sent.target, 'claude_code');
    assert.equal(sent.task, 'do the thing');
    assert.equal(sent.from, 'codex');
  } finally {
    backend.server.close();
  }
});

test('not configured: no RECODER_API_TOKEN on a remote URL returns a truthful error (no crash)', async () => {
  const resp = await callAdapter(
    { RECODER_DOCKER_URL: 'https://docker.recoder.xyz' }, // remote, no token, no allow-local
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'recoder_list_agents', arguments: {} } },
  );
  assert.equal(resp.id, 3);
  assert.ok(resp.error, 'should be a JSON-RPC error, not a fabricated success');
  assert.match(resp.error.message, /RECODER_API_TOKEN is required/);
  assert.equal(resp.result, undefined);
});

test('recoder_sandbox_run: missing DAYTONA config returns truthful error, not crash', async () => {
  const resp = await callAdapter(
    { RECODER_API_TOKEN: 'tok', RECODER_DAYTONA_URL: '', DAYTONA_API_KEY: '' },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'recoder_sandbox_run', arguments: { command: 'echo hi' } } },
  );
  assert.equal(resp.id, 4);
  assert.ok(resp.error);
  assert.match(resp.error.message, /RECODER_DAYTONA_URL not set/);
});

test('recoder_sandbox_run: missing command argument is rejected', async () => {
  const resp = await callAdapter(
    { RECODER_API_TOKEN: 'tok', RECODER_DAYTONA_URL: 'http://127.0.0.1:3900/api', DAYTONA_API_KEY: 'dyt_x' },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'recoder_sandbox_run', arguments: {} } },
  );
  assert.equal(resp.id, 5);
  assert.ok(resp.error);
  assert.match(resp.error.message, /requires a "command"/);
});

test('unknown tool returns method-not-found-style error', async () => {
  const resp = await callAdapter(
    { RECODER_API_TOKEN: 'tok' },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope', arguments: {} } },
  );
  assert.equal(resp.id, 6);
  assert.ok(resp.error);
  assert.match(resp.error.message, /Unknown tool/);
});
