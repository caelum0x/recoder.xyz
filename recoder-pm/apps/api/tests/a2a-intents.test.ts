import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/a2a/intents/[intent]/route';

const INTENT_EXECUTOR_ENV: Record<string, string> = {
  plan: 'RECODER_A2A_INTENT_PLAN_EXECUTOR_URL',
  execute: 'RECODER_A2A_INTENT_EXECUTE_EXECUTOR_URL',
  handoff: 'RECODER_A2A_INTENT_HANDOFF_EXECUTOR_URL',
  tool_call: 'RECODER_A2A_INTENT_TOOL_CALL_EXECUTOR_URL',
};

function clearIntentExecutors() {
  for (const envKey of Object.values(INTENT_EXECUTOR_ENV)) {
    delete process.env[envKey];
  }
}

test.beforeEach(() => {
  clearIntentExecutors();
  process.env.RECODER_A2A_WORKER_TOKEN = 'worker-token';
});

test('rejects missing worker token', async () => {
  const req = new Request('http://localhost/api/a2a/intents/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm1', threadId: 't1' } }),
  });

  const res = await POST(req, { params: { intent: 'plan' } });
  assert.equal(res.status, 401);
});

test('rejects mismatched intent', async () => {
  const req = new Request('http://localhost/api/a2a/intents/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-recoder-a2a-worker-token': 'worker-token',
    },
    body: JSON.stringify({ intent: 'execute', envelope: { messageId: 'm2', threadId: 't2' } }),
  });

  const res = await POST(req, { params: { intent: 'plan' } });
  assert.equal(res.status, 400);
});

test('rejects unsupported intent', async () => {
  const req = new Request('http://localhost/api/a2a/intents/unknown', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-recoder-a2a-worker-token': 'worker-token',
    },
    body: JSON.stringify({ intent: 'unknown' }),
  });

  const res = await POST(req, { params: { intent: 'unknown' } });
  assert.equal(res.status, 400);
});

test('rejects invalid json body', async () => {
  const req = new Request('http://localhost/api/a2a/intents/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-recoder-a2a-worker-token': 'worker-token',
    },
    body: '{',
  });

  const res = await POST(req, { params: { intent: 'plan' } });
  assert.equal(res.status, 400);
});

test('accepts request without token when worker token is not configured', async () => {
  delete process.env.RECODER_A2A_WORKER_TOKEN;
  const req = new Request('http://localhost/api/a2a/intents/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm-no-token', threadId: 't-no-token' } }),
  });

  const res = await POST(req, { params: { intent: 'plan' } });
  assert.equal(res.status, 202);
});

for (const intent of Object.keys(INTENT_EXECUTOR_ENV)) {
  test(`accepts valid intent payload for ${intent}`, async () => {
    const req = new Request(`http://localhost/api/a2a/intents/${intent}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: JSON.stringify({ intent, envelope: { messageId: `m-${intent}`, threadId: `t-${intent}` } }),
    });

    const res = await POST(req, { params: { intent } });
    assert.equal(res.status, 202);

    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.intent, intent);
    assert.equal(json.executor.executed, false);
  });

  test(`forwards ${intent} to configured executor url`, async () => {
    process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    try {
      const req = new Request(`http://localhost/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({
          intent,
          envelope: { messageId: `m-forward-${intent}`, threadId: `t-forward-${intent}` },
        }),
      });

      const res = await POST(req, { params: { intent } });
      assert.equal(res.status, 202);

      const json = await res.json();
      assert.equal(json.executor.executed, true);
      assert.equal(json.executor.status, 200);
      assert.equal(json.executor.url, `http://executor.local/${intent}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`returns executor failure details when ${intent} executor responds 500`, async () => {
    process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    try {
      const req = new Request(`http://localhost/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({
          intent,
          envelope: { messageId: `m-fail-${intent}`, threadId: `t-fail-${intent}` },
        }),
      });

      const res = await POST(req, { params: { intent } });
      assert.equal(res.status, 202);
      const json = await res.json();
      assert.equal(json.executor.executed, false);
      assert.equal(json.executor.status, 500);
      assert.equal(json.executor.url, `http://executor.local/${intent}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`returns executor failure details when ${intent} executor throws`, async () => {
    process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('executor_unreachable');
    }) as typeof fetch;

    try {
      const req = new Request(`http://localhost/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({
          intent,
          envelope: { messageId: `m-throw-${intent}`, threadId: `t-throw-${intent}` },
        }),
      });

      const res = await POST(req, { params: { intent } });
      assert.equal(res.status, 202);
      const json = await res.json();
      assert.equal(json.executor.executed, false);
      assert.equal(json.executor.url, `http://executor.local/${intent}`);
      assert.equal(String(json.executor.error).includes('executor_unreachable'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
