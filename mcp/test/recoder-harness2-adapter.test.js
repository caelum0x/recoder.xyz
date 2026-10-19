'use strict';
/**
 * Integration tests for recoder-harness2-adapter.js driven over real stdio JSON-RPC.
 *
 * This adapter is a read-only capability probe, not a task-dispatching engine (see
 * docs/engines/HARNESS2.md). The tests assert:
 *  - `initialize` advertises exactly the 2 read-only tools, and marks `kind: "capability-probe"`
 *    (never framed as a `ConductorRuntime`).
 *  - `harness2_describe` always reports `supports_arbitrary_task_dispatch: false` with real
 *    reasons (no fabricated capability).
 *  - `harness2_health` always reports `supportsTaskDispatch: false` and never fakes a
 *    dependency as present when it is absent from PATH.
 *  - an unknown tool returns a truthful JSON-RPC error, not a crash or fake success.
 *
 * Run: node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ADAPTER = path.join(__dirname, '..', 'recoder-harness2-adapter.js');
const lib = require('../recoder-harness2-adapter.js');

function callAdapter(request, env = {}) {
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

test('initialize: advertises exactly 2 read-only tools, kind=capability-probe', async () => {
  const resp = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(resp.id, 1);
  assert.equal(resp.result.kind, 'capability-probe');
  const names = resp.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['harness2_describe', 'harness2_health']);
});

test('harness2_describe: never claims arbitrary-task-dispatch capability, gives real reasons', async () => {
  const resp = await callAdapter({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'harness2_describe', arguments: {} },
  });
  assert.equal(resp.id, 2);
  assert.equal(resp.result.supports_arbitrary_task_dispatch, false);
  assert.ok(Array.isArray(resp.result.why_not) && resp.result.why_not.length > 0);
  assert.deepEqual(resp.result.supported_benchmarks, ['jb', 'lab', 'wb']);
  assert.equal(resp.result.source, 'https://github.com/google-research/harness2');
});

test('harness2_health: always reports supportsTaskDispatch=false with a reason', async () => {
  const resp = await callAdapter({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'harness2_health', arguments: {} },
  });
  assert.equal(resp.id, 3);
  assert.equal(resp.result.supportsTaskDispatch, false);
  assert.ok(typeof resp.result.reason === 'string' && resp.result.reason.length > 0);
  // Every dependency entry must be a real, structured probe result — never a bare boolean guess.
  for (const dep of Object.values(resp.result.dependencies)) {
    assert.ok(Object.prototype.hasOwnProperty.call(dep, 'present'));
    assert.ok(Object.prototype.hasOwnProperty.call(dep, 'version'));
  }
});

test('harness2_health: a binary absent from PATH is reported present:false, never faked', async () => {
  const resp = await callAdapter(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'harness2_health', arguments: {} } },
    // Strip PATH so nothing resolves; the probe must degrade truthfully, not throw or fabricate.
    { PATH: '/nonexistent-path-for-test' },
  );
  assert.equal(resp.id, 4);
  assert.equal(resp.result.ok, false);
  assert.equal(resp.result.dependencies.harness2.present, false);
  assert.equal(resp.result.dependencies.harness2.version, null);
});

test('unknown tool returns a truthful JSON-RPC error, not a crash', async () => {
  const resp = await callAdapter({
    jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} },
  });
  assert.equal(resp.id, 5);
  assert.ok(resp.error);
  assert.match(resp.error.message, /Unknown tool/);
});

test('unknown method returns a JSON-RPC error', async () => {
  const resp = await callAdapter({ jsonrpc: '2.0', id: 6, method: 'does/not/exist', params: {} });
  assert.equal(resp.id, 6);
  assert.ok(resp.error);
  assert.match(resp.error.message, /Unknown method/);
});

test('module exports: probeBinary reports absent binaries truthfully (unit-level)', () => {
  const result = lib.probeBinary('this-binary-does-not-exist-anywhere-xyz');
  assert.equal(result.present, false);
  assert.equal(result.version, null);
});

test('module exports: HARNESS2_BENCHMARKS matches the real closed CLI --bench choice set', () => {
  assert.deepEqual(lib.HARNESS2_BENCHMARKS, ['jb', 'lab', 'wb']);
});
