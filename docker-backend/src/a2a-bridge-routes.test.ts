import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { __resetA2ATestState, a2aRouter } from './a2a-gateway';

// Preserve real fetch before the global test setup replaces it with a mock.
const _realFetch = globalThis.fetch;

describe('A2A bridge routes', () => {
  let server: any;
  let baseUrl = '';

  beforeAll(() => { globalThis.fetch = _realFetch; });
  afterAll(() => { globalThis.fetch = _realFetch; });

  beforeEach(async () => {
    process.env.RECODER_A2A_ADMIN_TOKEN = 'admin-token';
    process.env.RECODER_A2A_BRIDGE_TOKEN = 'bridge-token';
    process.env.RECODER_A2A_BRIDGE_DEFAULT_ID = 'bridge-default';
    process.env.RECODER_A2A_ENABLE_CODEX = 'true';
    process.env.RECODER_A2A_ENABLE_CLAUDE_CODE = 'true';
    process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK = 'true';
    process.env.RECODER_A2A_CODEX_BASE_URL = '';
    process.env.RECODER_A2A_CLAUDE_CODE_BASE_URL = '';
    process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS = 'plan,execute,handoff,tool_call';
    process.env.RECODER_A2A_ORCH_MAX_TARGETS = '2';
    process.env.RECODER_A2A_ORCH_MAX_DEADLINE_MS = '600000';
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES;
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE;
    delete process.env.RECODER_A2A_BRIDGE_TOKEN_SCOPE;
    delete process.env.RECODER_A2A_ENFORCE_SCOPE;
    delete process.env.RECODER_A2A_ALLOW_HEADER_SCOPE_FALLBACK;
    delete process.env.RECODER_A2A_REDIS_URL;
    delete process.env.REDIS_URL;
    __resetA2ATestState();

    const app = express();
    app.use('/api/a2a', express.text({ type: 'application/json' }));
    app.use('/api/a2a', a2aRouter);
    server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('enqueues and dequeues bridge jobs', async () => {
    const enqueue = await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        agentId: 'codex',
        envelope: {
          messageId: 'msg-job-1',
          threadId: 'thread-job-1',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'hello' }],
        },
      }),
    });
    expect(enqueue.status).toBe(202);

    const next = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: 'Bearer bridge-token',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
    });
    expect(next.status).toBe(200);
    const job = await next.json();
    expect(job.agentId).toBe('codex');
    expect(job.envelope.messageId).toBe('msg-job-1');

    const empty = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: 'Bearer bridge-token',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
    });
    expect(empty.status).toBe(204);
  });

  it('issues scoped bridge session token and enforces bridgeId scope', async () => {
    process.env.RECODER_A2A_ENFORCE_SCOPE = 'true';
    process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES = JSON.stringify({ 'scope-admin': 'team-alpha' });

    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'scope-admin',
      },
      body: JSON.stringify({ bridgeId: 'bridge-scoped', issuedBy: 'test-suite' }),
    });
    expect(pair.status).toBe(201);
    const pairBody = await pair.json();
    expect(pairBody.ok).toBe(true);
    expect(typeof pairBody.token).toBe('string');
    expect(pairBody.scope).toBe('team-alpha');

    const enqueue = await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'scope-admin',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-scoped',
        agentId: 'codex',
        envelope: {
          messageId: 'msg-scope-1',
          threadId: 'thread-scope-1',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'scope check' }],
        },
      }),
    });
    expect(enqueue.status).toBe(202);

    const nextOk = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: `Bearer ${pairBody.token}`,
        'x-recoder-a2a-bridge-id': 'bridge-scoped',
      },
    });
    expect(nextOk.status).toBe(200);

    const nextWrongScope = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: `Bearer ${pairBody.token}`,
        'x-recoder-a2a-bridge-id': 'bridge-other',
      },
    });
    expect(nextWrongScope.status).toBe(403);

    const sessions = await fetch(`${baseUrl}/api/a2a/bridge/sessions`, {
      headers: { 'x-recoder-a2a-admin-token': 'scope-admin' },
    });
    expect(sessions.status).toBe(200);
    const sessionsBody = await sessions.json();
    expect(sessionsBody.ok).toBe(true);
    expect(Array.isArray(sessionsBody.sessions)).toBe(true);
    expect(sessionsBody.sessions.some((s: any) => s.bridgeId === 'bridge-scoped')).toBe(true);
    expect(sessionsBody.sessions.some((s: any) => s.bridgeId === 'bridge-scoped' && s.scope === 'team-alpha')).toBe(true);
  });

  it('filters bridge dequeue by token scope claim', async () => {
    process.env.RECODER_A2A_ENFORCE_SCOPE = 'true';
    process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES = JSON.stringify({
      'alpha-admin': 'team-alpha',
      'beta-admin': 'team-beta',
    });

    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'alpha-admin',
      },
      body: JSON.stringify({ bridgeId: 'bridge-scope-filter', issuedBy: 'test-suite' }),
    });
    expect(pair.status).toBe(201);
    const pairBody = await pair.json();
    expect(pairBody.scope).toBe('team-alpha');

    const enqueueBeta = await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'beta-admin',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-scope-filter',
        agentId: 'codex',
        envelope: {
          messageId: 'msg-beta-only',
          threadId: 'thread-beta-only',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'beta scope job' }],
        },
      }),
    });
    expect(enqueueBeta.status).toBe(202);

    const nextBlocked = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: `Bearer ${pairBody.token}`,
        'x-recoder-a2a-bridge-id': 'bridge-scope-filter',
      },
    });
    expect(nextBlocked.status).toBe(204);

    const enqueueAlpha = await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'alpha-admin',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-scope-filter',
        agentId: 'codex',
        envelope: {
          messageId: 'msg-alpha-only',
          threadId: 'thread-alpha-only',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'alpha scope job' }],
        },
      }),
    });
    expect(enqueueAlpha.status).toBe(202);

    const nextAllowed = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: `Bearer ${pairBody.token}`,
        'x-recoder-a2a-bridge-id': 'bridge-scope-filter',
      },
    });
    expect(nextAllowed.status).toBe(200);
    const allowedJob = await nextAllowed.json();
    expect(allowedJob.envelope.messageId).toBe('msg-alpha-only');
    expect(allowedJob.scope).toBe('team-alpha');
  });

  it('stores and exposes bridge job results', async () => {
    const enqueue = await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        jobId: 'job-42',
        agentId: 'claude_code',
        envelope: {
          messageId: 'msg-job-42',
          threadId: 'thread-job-42',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'claude', platform: 'claude_code' },
          payload: [{ kind: 'text', text: 'hello' }],
        },
      }),
    });
    expect(enqueue.status).toBe(202);

    const next = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: 'Bearer bridge-token',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
    });
    expect(next.status).toBe(200);

    const postResult = await fetch(`${baseUrl}/api/a2a/bridge/jobs/job-42/result`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        resultEnvelope: {
          messageId: 'msg-job-42-result',
          threadId: 'thread-job-42',
          intent: 'tool_result',
          from: { id: 'claude', platform: 'claude_code' },
          to: { id: 'web', platform: 'recoder_web' },
          payload: [{ kind: 'text', text: 'done' }],
        },
      }),
    });
    expect(postResult.status).toBe(200);

    const duplicateResult = await fetch(`${baseUrl}/api/a2a/bridge/jobs/job-42/result`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        resultEnvelope: {
          messageId: 'msg-job-42-result-duplicate',
          threadId: 'thread-job-42',
          intent: 'tool_result',
          from: { id: 'claude', platform: 'claude_code' },
          to: { id: 'web', platform: 'recoder_web' },
          payload: [{ kind: 'text', text: 'done-again' }],
        },
      }),
    });
    expect(duplicateResult.status).toBe(202);
    const duplicateBody = await duplicateResult.json();
    expect(duplicateBody.duplicate).toBe(true);

    const getResult = await fetch(`${baseUrl}/api/a2a/bridge/jobs/job-42/result`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(getResult.status).toBe(200);
    const result = await getResult.json();
    expect(result.ok).toBe(true);
    expect(result.result.ok).toBe(true);
  });

  it('queues orchestrated codex job to bridge when fallback is enabled', async () => {
    const orchestrate = await fetch(`${baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'codex_only',
        bridgeId: 'bridge-default',
        envelope: {
          messageId: 'msg-orch-bridge',
          threadId: 'thread-orch-bridge',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'plan and execute' }],
          metadata: { traceId: 'trace-orch-bridge' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);
    const orchestration = await orchestrate.json();
    expect(orchestration.ok).toBe(true);
    expect(orchestration.results[0].channel).toBe('bridge');

    const next = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: 'Bearer bridge-token',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
    });
    expect(next.status).toBe(200);
    const job = await next.json();
    expect(job.agentId).toBe('codex');
    expect(job.envelope.messageId).toBe('msg-orch-bridge');
  });

  it('accepts bridge heartbeat', async () => {
    const response = await fetch(`${baseUrl}/api/a2a/bridge/heartbeat`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'content-type': 'application/json',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        capabilities: ['codex', 'claude_code'],
      }),
    });
    expect(response.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/a2a/bridge/heartbeats`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.heartbeats)).toBe(true);
    expect(listBody.heartbeats.some((entry: any) => entry.bridgeId === 'bridge-default')).toBe(true);

    const single = await fetch(`${baseUrl}/api/a2a/bridge/heartbeats/bridge-default`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(single.status).toBe(200);
    const singleBody = await single.json();
    expect(singleBody.ok).toBe(true);
    expect(singleBody.bridgeId).toBe('bridge-default');

    const status = await fetch(`${baseUrl}/api/a2a/bridge/status`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(status.status).toBe(200);
    const statusBody = await status.json();
    expect(statusBody.ok).toBe(true);
    expect(Array.isArray(statusBody.bridges)).toBe(true);
    expect(statusBody.bridges.some((row: any) => row.bridgeId === 'bridge-default')).toBe(true);
  });

  it('reads orchestration state by threadId and traceId', async () => {
    const orchestrate = await fetch(`${baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'codex_only',
        bridgeId: 'bridge-default',
        envelope: {
          messageId: 'msg-orch-state',
          threadId: 'thread-orch-state',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'status check' }],
          metadata: { traceId: 'trace-orch-state' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const state = await fetch(`${baseUrl}/api/a2a/orchestrate/thread-orch-state/trace-orch-state`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(state.status).toBe(200);
    const stateBody = await state.json();
    expect(stateBody.ok).toBe(true);
    expect(stateBody.state.threadId).toBe('thread-orch-state');
  });

  it('rejects orchestration by policy when intent is not allowlisted', async () => {
    process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS = 'plan';

    const orchestrate = await fetch(`${baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'codex_only',
        bridgeId: 'bridge-default',
        envelope: {
          messageId: 'msg-policy-reject',
          threadId: 'thread-policy-reject',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'blocked by policy' }],
        },
      }),
    });
    expect(orchestrate.status).toBe(403);
    const body = await orchestrate.json();
    expect(body.ok).toBe(false);
  });

  it('updates policy at runtime and enforces dual approval', async () => {
    const updatePolicy = await fetch(`${baseUrl}/api/a2a/policy`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        allowedIntents: ['execute', 'plan'],
        requireDualApprovalIntents: ['execute'],
        maxTargets: 2,
      }),
    });
    expect(updatePolicy.status).toBe(200);
    const policyBody = await updatePolicy.json();
    expect(policyBody.ok).toBe(true);
    expect(policyBody.policy.requireDualApprovalIntents).toContain('execute');

    const rejected = await fetch(`${baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'codex_only',
        bridgeId: 'bridge-default',
        envelope: {
          messageId: 'msg-dual-reject',
          threadId: 'thread-dual-reject',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'needs two approvers' }],
        },
      }),
    });
    expect(rejected.status).toBe(409);
    const rejectedBody = await rejected.json();
    expect(rejectedBody.ok).toBe(false);

    const accepted = await fetch(`${baseUrl}/api/a2a/orchestrate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        mode: 'parallel',
        bridgeId: 'bridge-default',
        envelope: {
          messageId: 'msg-dual-ok',
          threadId: 'thread-dual-ok',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'two agents' }],
        },
      }),
    });
    expect(accepted.status).toBe(202);
  });

  it('exposes audit events for admin', async () => {
    await fetch(`${baseUrl}/api/a2a/bridge/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        agentId: 'codex',
        envelope: {
          messageId: 'msg-audit-1',
          threadId: 'thread-audit-1',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'audit' }],
        },
      }),
    });

    const audit = await fetch(`${baseUrl}/api/a2a/audit?limit=20`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(audit.status).toBe(200);
    const auditBody = await audit.json();
    expect(auditBody.ok).toBe(true);
    expect(Array.isArray(auditBody.events)).toBe(true);
    expect(auditBody.events.length).toBeGreaterThan(0);
    expect(auditBody.events.some((event: any) => event.event === 'bridge_job_enqueued')).toBe(true);
  });
});
