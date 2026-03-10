import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

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

describe('POST /api/a2a/intents/[intent]', () => {
  beforeEach(() => {
    clearIntentExecutors();
    process.env.RECODER_A2A_WORKER_TOKEN = 'worker-token';
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing worker token', async () => {
    const req = new Request('http://localhost/api/a2a/intents/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm1', threadId: 't1' } }),
    });

    const res = await POST(req, { params: Promise.resolve({ intent: 'plan' }) });
    expect(res.status).toBe(401);
  });

  it('rejects mismatched intent', async () => {
    const req = new Request('http://localhost/api/a2a/intents/plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: JSON.stringify({ intent: 'execute', envelope: { messageId: 'm2', threadId: 't2' } }),
    });

    const res = await POST(req, { params: Promise.resolve({ intent: 'plan' }) });
    expect(res.status).toBe(400);
  });

  it('rejects unsupported intent', async () => {
    const req = new Request('http://localhost/api/a2a/intents/unknown', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: JSON.stringify({ intent: 'unknown' }),
    });
    const res = await POST(req, { params: Promise.resolve({ intent: 'unknown' }) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid json body', async () => {
    const req = new Request('http://localhost/api/a2a/intents/plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: '{',
    });
    const res = await POST(req, { params: Promise.resolve({ intent: 'plan' }) });
    expect(res.status).toBe(400);
  });

  it('accepts request without token when worker token is not configured', async () => {
    delete process.env.RECODER_A2A_WORKER_TOKEN;
    const req = new Request('http://localhost/api/a2a/intents/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm-no-token', threadId: 't-no-token' } }),
    });
    const res = await POST(req, { params: Promise.resolve({ intent: 'plan' }) });
    expect(res.status).toBe(202);
  });

  for (const intent of Object.keys(INTENT_EXECUTOR_ENV)) {
    it(`accepts valid intent payload for ${intent}`, async () => {
      const req = new Request(`http://localhost/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({ intent, envelope: { messageId: `m-${intent}`, threadId: `t-${intent}` } }),
      });

      const res = await POST(req, { params: Promise.resolve({ intent }) });
      const json = await res.json();
      expect(res.status).toBe(202);
      expect(json.ok).toBe(true);
      expect(json.intent).toBe(intent);
      expect(json.executor.executed).toBe(false);
    });

    it(`forwards ${intent} to configured executor url`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

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

      const res = await POST(req, { params: Promise.resolve({ intent }) });
      const json = await res.json();
      expect(res.status).toBe(202);
      expect(json.executor.executed).toBe(true);
      expect(json.executor.status).toBe(200);
      expect(json.executor.url).toBe(`http://executor.local/${intent}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it(`returns executor failure details when ${intent} executor responds 500`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'content-type': 'application/json' } }),
      );

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

      const res = await POST(req, { params: Promise.resolve({ intent }) });
      const json = await res.json();
      expect(res.status).toBe(202);
      expect(json.executor.executed).toBe(false);
      expect(json.executor.status).toBe(500);
      expect(json.executor.url).toBe(`http://executor.local/${intent}`);
    });

    it(`returns executor failure details when ${intent} executor throws`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = `http://executor.local/${intent}`;
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('executor_unreachable'));

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

      const res = await POST(req, { params: Promise.resolve({ intent }) });
      const json = await res.json();
      expect(res.status).toBe(202);
      expect(json.executor.executed).toBe(false);
      expect(json.executor.url).toBe(`http://executor.local/${intent}`);
      expect(String(json.executor.error || '')).toContain('executor_unreachable');
    });
  }
});
