import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';

// Preserve real fetch before the global test setup replaces it with a mock.
const _realFetch = globalThis.fetch;

import {
  __createSignatureForTest,
  __resetA2ATestState,
  a2aRouter,
} from './a2a-gateway';

type RunningServer = {
  server: any;
  baseUrl: string;
};

async function startJsonServer(register: (app: express.Express) => void): Promise<RunningServer> {
  const app = express();
  app.use(express.text({ type: 'application/json' }));
  register(app);

  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: any | undefined): Promise<void> {
  if (!server) return;
  const closePromise = once(server, 'close');
  server.close();
  await closePromise;
}

describe('A2A orchestrator routes', () => {
  let gateway: RunningServer | undefined;
  let codex: RunningServer | undefined;
  let claude: RunningServer | undefined;

  beforeAll(() => { globalThis.fetch = _realFetch; });
  afterAll(() => { globalThis.fetch = _realFetch; });

  beforeEach(async () => {
    process.env.RECODER_A2A_SHARED_SECRET = 'test-secret';
    process.env.RECODER_A2A_ADMIN_TOKEN = 'admin-token';
    process.env.RECODER_A2A_ENABLE_CODEX = 'true';
    process.env.RECODER_A2A_ENABLE_CLAUDE_CODE = 'true';
    delete process.env.RECODER_A2A_ENFORCE_SCOPE;
    delete process.env.RECODER_A2A_ALLOW_HEADER_SCOPE_FALLBACK;
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES;
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE;
    delete process.env.RECODER_A2A_REDIS_URL;
    delete process.env.REDIS_URL;
    __resetA2ATestState();

    codex = await startJsonServer((app) => {
      app.get('/.well-known/agent-card.json', (_req, res) => {
        res.status(200).json({ ok: true, agent: 'codex' });
      });
      app.post('/api/a2a/envelope', async (req, res) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
        const timestamp = String(req.header('x-recoder-a2a-timestamp') || '');
        const signature = String(req.header('x-recoder-a2a-signature') || '');
        const expected = await __createSignatureForTest(timestamp, rawBody, 'test-secret');
        res.status(200).json({
          ok: signature === `v1=${expected}`,
          receiver: 'codex',
          messageId: JSON.parse(rawBody).messageId,
        });
      });
    });

    claude = await startJsonServer((app) => {
      app.get('/.well-known/agent-card.json', (_req, res) => {
        res.status(200).json({ ok: true, agent: 'claude' });
      });
      app.post('/api/a2a/envelope', (req, res) => {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
        res.status(200).json({ ok: true, receiver: 'claude', messageId: JSON.parse(rawBody).messageId });
      });
    });

    process.env.RECODER_A2A_CODEX_BASE_URL = codex.baseUrl;
    process.env.RECODER_A2A_CLAUDE_CODE_BASE_URL = claude.baseUrl;

    gateway = await startJsonServer((app) => {
      app.use('/api/a2a', a2aRouter);
    });
  });

  afterEach(async () => {
    await closeServer(gateway?.server);
    await closeServer(codex?.server);
    await closeServer(claude?.server);
    gateway = undefined;
    codex = undefined;
    claude = undefined;
  });

  it('rejects /agents without admin token', async () => {
    const res = await fetch(`${gateway?.baseUrl}/api/a2a/agents`);
    expect(res.status).toBe(401);
  });

  it('lists builtin agents with admin token', async () => {
    const res = await fetch(`${gateway?.baseUrl}/api/a2a/agents`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.agents)).toBe(true);
    expect(json.agents.some((agent: any) => agent.agent_id === 'codex')).toBe(true);
    expect(json.agents.some((agent: any) => agent.agent_id === 'claude_code')).toBe(true);
  });

  it('updates an agent and runs health test', async () => {
    const updateRes = await fetch(`${gateway?.baseUrl}/api/a2a/agents/codex`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({ enabled: true, base_url: codex?.baseUrl }),
    });
    expect(updateRes.status).toBe(200);

    const healthRes = await fetch(`${gateway?.baseUrl}/api/a2a/agents/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({ agent_id: 'codex' }),
    });
    expect(healthRes.status).toBe(200);
    const json = await healthRes.json();
    expect(json.ok).toBe(true);
    expect(json.agent.health).toBe('healthy');
  });

  it('orchestrates in parallel to codex and claude_code', async () => {
    const res = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-parallel-1',
          threadId: 'thread-1',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
          metadata: { traceId: 'trace-1' },
        },
      }),
    });

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.selected).toEqual(['codex', 'claude_code']);
    expect(json.results).toHaveLength(2);
    expect(json.results.every((row: any) => row.ok === true)).toBe(true);
    expect(json.results.every((row: any) => typeof row.durationMs === 'number')).toBe(true);
    expect(json.merge.strategy).toBe('deterministic_score_v1');
    expect(json.merge.winnerAgentId).toBe('claude_code');
    expect(Array.isArray(json.merge.candidates)).toBe(true);
    expect(Array.isArray(json.merge.conflictReasons)).toBe(true);
    expect(json.merge.collaboration.objective).toBe('cooperative_execution');
    expect(Array.isArray(json.merge.collaboration.assignments)).toBe(true);
    expect(json.merge.collaboration.assignments.length).toBeGreaterThan(0);

    const persisted = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-1/trace-1`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(persisted.status).toBe(200);
    const persistedBody = await persisted.json();
    expect(persistedBody.ok).toBe(true);
    expect(persistedBody.state.merge.winnerAgentId).toBe('claude_code');

    const history = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-1/trace-1/history`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(history.status).toBe(200);
    const historyBody = await history.json();
    expect(historyBody.ok).toBe(true);
    expect(historyBody.historyVersion).toBe('2026-02-14.v1');
    expect(historyBody.summary.winnerAgentId).toBe('claude_code');
    expect(Array.isArray(historyBody.timeline)).toBe(true);
    expect(typeof historyBody.page.limit).toBe('number');
    expect(typeof historyBody.page.cursor).toBe('number');
  });

  it('supports operator merge override with audit-ready metadata', async () => {
    const orchestrate = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-override-1',
          threadId: 'thread-override-1',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
          metadata: { traceId: 'trace-override-1' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const override = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1/override`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        winnerAgentId: 'codex',
        reason: 'manual quality preference',
        overrideBy: 'ops-user',
      }),
    });
    expect(override.status).toBe(200);
    const overrideBody = await override.json();
    expect(overrideBody.ok).toBe(true);
    expect(overrideBody.merge.overridden).toBe(true);
    expect(overrideBody.merge.winnerAgentId).toBe('codex');
    expect(overrideBody.merge.conflictReasons).toContain('manual_override');
    expect(Array.isArray(overrideBody.overrideHistory)).toBe(true);
    expect(overrideBody.overrideHistory).toHaveLength(1);
    expect(overrideBody.overrideHistory[0].winnerAgentId).toBe('codex');

    const secondOverride = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1/override`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        winnerAgentId: 'claude_code',
        reason: 'manual rollback to claude',
        overrideBy: 'ops-user-2',
      }),
    });
    expect(secondOverride.status).toBe(200);
    const secondOverrideBody = await secondOverride.json();
    expect(secondOverrideBody.overrideHistory).toHaveLength(2);
    expect(secondOverrideBody.overrideHistory[0].winnerAgentId).toBe('codex');
    expect(secondOverrideBody.overrideHistory[1].winnerAgentId).toBe('claude_code');
    expect(secondOverrideBody.overrideHistory[1].previousWinnerAgentId).toBe('codex');

    const persisted = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(persisted.status).toBe(200);
    const persistedBody = await persisted.json();
    expect(persistedBody.state.merge.overridden).toBe(true);
    expect(persistedBody.state.merge.override.by).toBe('ops-user-2');
    expect(Array.isArray(persistedBody.state.overrideHistory)).toBe(true);
    expect(persistedBody.state.overrideHistory).toHaveLength(2);

    const recompute = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1/recompute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({ primaryAgent: 'codex' }),
    });
    expect(recompute.status).toBe(200);
    const recomputeBody = await recompute.json();
    expect(recomputeBody.ok).toBe(true);
    expect(recomputeBody.merge.overridden).toBe(false);
    expect(recomputeBody.merge.winnerAgentId).toBe('codex');
    expect(Array.isArray(recomputeBody.overrideHistory)).toBe(true);
    expect(recomputeBody.overrideHistory).toHaveLength(2);

    const history = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1/history`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(history.status).toBe(200);
    const historyBody = await history.json();
    expect(historyBody.ok).toBe(true);
    expect(historyBody.summary.collaboration.objective).toBe('cooperative_execution');
    expect(Array.isArray(historyBody.overrideHistory)).toBe(true);
    expect(historyBody.overrideHistory).toHaveLength(2);
    expect(Array.isArray(historyBody.timeline)).toBe(true);
    expect(historyBody.timeline.some((event: any) => event.type === 'merge_override')).toBe(true);

    const pagedHistory = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-1/trace-override-1/history?limit=1&cursor=1`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(pagedHistory.status).toBe(200);
    const pagedBody = await pagedHistory.json();
    expect(pagedBody.ok).toBe(true);
    expect(pagedBody.page.limit).toBe(1);
    expect(pagedBody.page.cursor).toBe(1);
    expect(Array.isArray(pagedBody.timeline)).toBe(true);
    expect(pagedBody.timeline.length).toBe(1);
  });

  it('rejects override when winner is not in candidates', async () => {
    const orchestrate = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-override-invalid',
          threadId: 'thread-override-invalid',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
          metadata: { traceId: 'trace-override-invalid' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const override = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-override-invalid/trace-override-invalid/override`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        winnerAgentId: 'nonexistent-agent',
        reason: 'bad input',
      }),
    });
    expect(override.status).toBe(400);
  });

  it('returns 409 when requested mode has no available agents', async () => {
    const disableCodex = await fetch(`${gateway?.baseUrl}/api/a2a/agents/codex`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({ enabled: false, base_url: '' }),
    });
    expect(disableCodex.status).toBe(200);

    const res = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'codex_only',
        envelope: {
          messageId: 'msg-codex-only-1',
          threadId: 'thread-2',
          intent: 'plan',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
        },
      }),
    });
    expect(res.status).toBe(409);
  });

  it('returns structured diagnostics when orchestration envelope is invalid', async () => {
    const res = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-invalid-envelope',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
        },
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe('INVALID_A2A_ENVELOPE');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.some((issue: any) => issue.path === 'envelope.threadId')).toBe(true);
  });

  it('enforces orchestration scope isolation when enabled', async () => {
    process.env.RECODER_A2A_ENFORCE_SCOPE = 'true';
    process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES = JSON.stringify({
      'alpha-token': 'team-alpha',
      'beta-token': 'team-beta',
    });

    const orchestrate = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'alpha-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-scope-iso-1',
          threadId: 'thread-scope-iso-1',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
          metadata: { traceId: 'trace-scope-iso-1' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const denied = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-scope-iso-1/trace-scope-iso-1/history`, {
      headers: {
        'x-recoder-a2a-admin-token': 'beta-token',
      },
    });
    expect(denied.status).toBe(403);

    const allowed = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate/thread-scope-iso-1/trace-scope-iso-1/history`, {
      headers: {
        'x-recoder-a2a-admin-token': 'alpha-token',
      },
    });
    expect(allowed.status).toBe(200);
    const allowedBody = await allowed.json();
    expect(allowedBody.ok).toBe(true);
  });

  it('rejects token scope and header scope mismatch when scope enforcement is enabled', async () => {
    process.env.RECODER_A2A_ENFORCE_SCOPE = 'true';
    process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES = JSON.stringify({
      'alpha-token': 'team-alpha',
    });

    const res = await fetch(`${gateway?.baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'alpha-token',
        'x-recoder-a2a-scope': 'team-beta',
      },
      body: JSON.stringify({
        mode: 'parallel',
        envelope: {
          messageId: 'msg-scope-mismatch-1',
          threadId: 'thread-scope-mismatch-1',
          intent: 'execute',
          from: { id: 'recoder-web', platform: 'recoder_web' },
          to: { id: 'recoder-backend', platform: 'recoder_backend' },
          payload: [],
          metadata: { traceId: 'trace-scope-mismatch-1' },
        },
      }),
    });
    expect(res.status).toBe(403);
  });
});
