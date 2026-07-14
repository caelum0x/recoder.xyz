import { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { a2aRouter } from './a2a-gateway';

// Preserve real fetch before the global test setup replaces it with a mock.
const _realFetch = globalThis.fetch;

const INTENT_EXECUTOR_ENV: Record<string, string> = {
  plan: 'RECODER_A2A_INTENT_PLAN_EXECUTOR_URL',
  execute: 'RECODER_A2A_INTENT_EXECUTE_EXECUTOR_URL',
  review: 'RECODER_A2A_INTENT_REVIEW_EXECUTOR_URL',
  handoff: 'RECODER_A2A_INTENT_HANDOFF_EXECUTOR_URL',
  tool_call: 'RECODER_A2A_INTENT_TOOL_CALL_EXECUTOR_URL',
};

function clearIntentExecutors() {
  for (const envKey of Object.values(INTENT_EXECUTOR_ENV)) {
    delete process.env[envKey];
  }
}

describe('POST /api/a2a/intents/:intent', () => {
  let baseUrl = '';
  let server: any;
  let executorBaseUrl = '';
  let executorServer: any;

  beforeAll(() => { globalThis.fetch = _realFetch; });
  afterAll(() => { globalThis.fetch = _realFetch; });

  async function startServer(app: express.Express): Promise<any> {
    const instance = app.listen(0);
    await once(instance, 'listening');
    return instance;
  }

  async function closeServer(serverRef: any): Promise<void> {
    if (!serverRef) return;
    const closePromise = once(serverRef, 'close');
    serverRef.close();
    await closePromise;
  }

  beforeEach(async () => {
    process.env.RECODER_A2A_WORKER_TOKEN = 'worker-token';
    clearIntentExecutors();

    const app = express();
    app.use('/api/a2a', express.text({ type: 'application/json' }));
    app.use('/api/a2a', a2aRouter);

    server = await startServer(app);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const executorApp = express();
    executorApp.use(express.json());
    executorApp.post('/plan', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    executorApp.post('/execute', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    executorApp.post('/handoff', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    executorApp.post('/review', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    executorApp.post('/tool_call', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    executorApp.post('/fail/:intent', (_req, res) => {
      res.status(500).json({ ok: false });
    });
    executorServer = await startServer(executorApp);
    const executorAddress = executorServer.address() as AddressInfo;
    executorBaseUrl = `http://127.0.0.1:${executorAddress.port}`;
  });

  afterEach(async () => {
    if (!server) return;
    await closeServer(server);
    await closeServer(executorServer);
  });

  it('rejects missing worker token', async () => {
    const res = await fetch(`${baseUrl}/api/a2a/intents/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm1', threadId: 't1' } }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects intent mismatch', async () => {
    const res = await fetch(`${baseUrl}/api/a2a/intents/plan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: JSON.stringify({ intent: 'execute', envelope: { messageId: 'm2', threadId: 't2' } }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects unsupported intent', async () => {
    const res = await fetch(`${baseUrl}/api/a2a/intents/unknown`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: JSON.stringify({ intent: 'unknown' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid json body', async () => {
    const res = await fetch(`${baseUrl}/api/a2a/intents/plan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-worker-token': 'worker-token',
      },
      body: '{',
    });
    expect(res.status).toBe(400);
  });

  it('accepts request without token when worker token is not configured', async () => {
    delete process.env.RECODER_A2A_WORKER_TOKEN;
    const res = await fetch(`${baseUrl}/api/a2a/intents/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'plan', envelope: { messageId: 'm-no-token', threadId: 't-no-token' } }),
    });
    expect(res.status).toBe(202);
  });

  for (const intent of Object.keys(INTENT_EXECUTOR_ENV)) {
    it(`accepts valid intent payload for ${intent}`, async () => {
      const res = await fetch(`${baseUrl}/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({ intent, envelope: { messageId: `m-${intent}`, threadId: `t-${intent}` } }),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.intent).toBe(intent);
      expect(json.executor.executed).toBe(false);
    });

    it(`forwards ${intent} to configured executor url`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = `${executorBaseUrl}/${intent}`;

      const res = await fetch(`${baseUrl}/api/a2a/intents/${intent}`, {
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

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.executor.executed).toBe(true);
      expect(json.executor.status).toBe(200);
      expect(json.executor.url).toBe(`${executorBaseUrl}/${intent}`);
    });

    it(`returns executor failure details when ${intent} executor responds 500`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = `${executorBaseUrl}/fail/${intent}`;

      const res = await fetch(`${baseUrl}/api/a2a/intents/${intent}`, {
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

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.executor.executed).toBe(false);
      expect(json.executor.status).toBe(500);
      expect(json.executor.url).toBe(`${executorBaseUrl}/fail/${intent}`);
    });

    it(`returns executor failure details when ${intent} executor is unreachable`, async () => {
      process.env[INTENT_EXECUTOR_ENV[intent]] = 'http://127.0.0.1:1/unreachable';

      const res = await fetch(`${baseUrl}/api/a2a/intents/${intent}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-recoder-a2a-worker-token': 'worker-token',
        },
        body: JSON.stringify({
          intent,
          envelope: { messageId: `m-unreachable-${intent}`, threadId: `t-unreachable-${intent}` },
        }),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.executor.executed).toBe(false);
      expect(json.executor.url).toBe('http://127.0.0.1:1/unreachable');
      expect(typeof json.executor.error).toBe('string');
      expect(String(json.executor.error).length).toBeGreaterThan(0);
    });
  }
});
