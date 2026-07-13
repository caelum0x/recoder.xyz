'use strict';
/**
 * Focused test for the recoder_logs_* capability bridge tools (the agent-facing
 * last mile of the `recoder.logs` in-proc engine). Verifies each tool routes to
 * the right gated interop endpoint (server `recoder.logs`, the right toolName +
 * args), formats real RunEvents truthfully, surfaces denied/error outcomes, and
 * degrades to a truthful "not available" without INTERNAL_SERVICE_KEY — never a
 * faked result.
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const CANONICAL = path.resolve(__dirname, '..', 'recoder-capability-tools.cjs');
const { createCapabilityTools, CAPABILITY_TOOLS } = require(CANONICAL);

const originalFetch = global.fetch;
const originalKey = process.env.INTERNAL_SERVICE_KEY;

/** Capture fetch calls and reply with a completed interop outcome. */
function stubFetch(result, { status = 200, outcomeStatus = 'completed', reason } = {}) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        success: outcomeStatus === 'completed',
        data: { status: outcomeStatus, reason, result: { content: result } },
      }),
    };
  };
  return calls;
}

beforeEach(() => {
  process.env.INTERNAL_SERVICE_KEY = 'test-key';
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.INTERNAL_SERVICE_KEY;
  else process.env.INTERNAL_SERVICE_KEY = originalKey;
});

test('the bridge exposes the three logs tools promised by the capability map', () => {
  const names = new Set(CAPABILITY_TOOLS.map((t) => t.name));
  for (const name of ['recoder_logs_search', 'recoder_logs_stream', 'recoder_logs_append']) {
    assert.ok(names.has(name), `missing bridge tool: ${name}`);
  }
});

test('recoder_logs_search routes to recoder.logs logs.search and formats events', async () => {
  const calls = stubFetch([
    { type: 'log', createdAt: '2026-07-13T00:00:00.000Z', agentId: 'a1', message: 'build compiled ok' },
  ]);
  const cap = createCapabilityTools({ agentId: 'test_agent', internalUrl: 'http://backend:3001' });
  const out = await cap.handleCapabilityTool('recoder_logs_search', { query: 'compiled', runId: 'run_t1' });

  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].url, /\/api\/mcp\/tools\/recoder\.logs\/logs\.search\/call$/);
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body.args, { query: 'compiled', runId: 'run_t1' });
  assert.strictEqual(calls[0].init.headers['x-internal-service-key'], 'test-key');
  assert.match(out, /\[log\] 2026-07-13T00:00:00\.000Z \(a1\) build compiled ok/);
});

test('recoder_logs_stream routes to logs.stream and reports an empty run truthfully', async () => {
  const calls = stubFetch([]);
  const cap = createCapabilityTools({ agentId: 'test_agent' });
  const out = await cap.handleCapabilityTool('recoder_logs_stream', { runId: 'run_t2', limit: 5 });

  assert.match(calls[0].url, /\/api\/mcp\/tools\/recoder\.logs\/logs\.stream\/call$/);
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body.args, { runId: 'run_t2', limit: 5 });
  assert.match(out, /No log events yet for run run_t2\./);
});

test('recoder_logs_append routes to logs.append and returns the new eventId', async () => {
  const calls = stubFetch({ eventId: 'event_abc' });
  const cap = createCapabilityTools({ agentId: 'test_agent' });
  const out = await cap.handleCapabilityTool('recoder_logs_append', {
    runId: 'run_t3',
    message: 'verified: unit tests green',
    taskId: 't3',
  });

  assert.match(calls[0].url, /\/api\/mcp\/tools\/recoder\.logs\/logs\.append\/call$/);
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body.args, { runId: 'run_t3', message: 'verified: unit tests green', taskId: 't3' });
  assert.match(out, /Appended log event event_abc to run run_t3\./);
});

test('a policy denial surfaces as a truthful error string, never a faked result', async () => {
  stubFetch(undefined, { status: 403, outcomeStatus: 'denied', reason: 'not allowed' });
  const cap = createCapabilityTools({ agentId: 'test_agent' });
  const out = await cap.handleCapabilityTool('recoder_logs_append', { runId: 'run_t4', message: 'x' });
  assert.match(out, /logs append: capability denied by policy: not allowed/);
});

test('without INTERNAL_SERVICE_KEY every logs tool degrades truthfully', async () => {
  delete process.env.INTERNAL_SERVICE_KEY;
  const cap = createCapabilityTools({ agentId: 'test_agent' });
  for (const [name, args] of [
    ['recoder_logs_search', { query: 'x' }],
    ['recoder_logs_stream', { runId: 'r' }],
    ['recoder_logs_append', { runId: 'r', message: 'm' }],
  ]) {
    const out = await cap.handleCapabilityTool(name, args);
    assert.match(out, /not available in this run/);
  }
});
