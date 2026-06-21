import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { __resetA2ATestState, a2aRouter } from './a2a-gateway';
import { getWorkspaceService, resetWorkspaceService } from './a2a/workspace.service';
import { getAgentRegistryService, resetAgentRegistryService } from './a2a/agent-registry.service';

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
    resetWorkspaceService();
    resetAgentRegistryService();

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

  function createWorkspace(memberAgentIds: string[], projectId = `proj-${Math.random().toString(16).slice(2, 10)}`) {
    return getWorkspaceService().create({
      name: `ws-${projectId}`,
      projectId,
      ownerId: 'test-owner',
      memberAgentIds,
    });
  }

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
          from: { id: 'web', platform: 'recoder_app' },
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
    const workspace = createWorkspace(['codex-agent-1'], 'proj-agent-1');

    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'scope-admin',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-scoped',
        issuedBy: 'test-suite',
        agentId: 'codex-agent-1',
        agentName: 'Codex Agent One',
        agentPlatform: 'codex',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-agent-1',
        capabilities: ['plan', 'execute'],
        metadata: { sessionOwner: 'codex' },
      }),
    });
    expect(pair.status).toBe(201);
    const pairBody = await pair.json();
    expect(pairBody.ok).toBe(true);
    expect(typeof pairBody.token).toBe('string');
    expect(pairBody.scope).toBe('team-alpha');
    expect(pairBody.agentId).toBe('codex-agent-1');
    expect(pairBody.agentName).toBe('Codex Agent One');
    expect(pairBody.agentPlatform).toBe('codex');
    expect(pairBody.workspaceId).toBe(workspace.workspaceId);
    expect(pairBody.projectId).toBe('proj-agent-1');
    expect(pairBody.capabilities).toEqual(['plan', 'execute']);
    expect(pairBody.normalizedCapabilities).toEqual(['execute', 'plan']);
    expect(pairBody.metadata).toEqual({ sessionOwner: 'codex' });
    expect(getAgentRegistryService().get('codex-agent-1')?.identity.platform).toBe('codex');

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
          from: { id: 'web', platform: 'recoder_app' },
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
    expect(
      sessionsBody.sessions.some(
        (s: any) =>
          s.bridgeId === 'bridge-scoped' &&
          s.agentId === 'codex-agent-1' &&
          s.registry?.registered === true &&
          s.registry?.online === true &&
          s.workspaceId === workspace.workspaceId &&
          s.projectId === 'proj-agent-1',
      ),
    ).toBe(true);
  });

  it('rejects incomplete bridge session ownership binding', async () => {
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-invalid-binding',
        workspaceId: 'ws-only',
      }),
    });
    expect(pair.status).toBe(400);
    const body = await pair.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('agentId is required');
  });

  it('reuses an existing bound bridge session on reconnect and refreshes metadata', async () => {
    const workspace = createWorkspace(['codex-agent-reuse'], 'proj-reuse');
    const firstPair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-reuse',
        agentId: 'codex-agent-reuse',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-reuse',
        capabilities: ['plan'],
        metadata: { reconnectCount: 0 },
      }),
    });
    expect(firstPair.status).toBe(201);
    const firstBody = await firstPair.json();
    expect(firstBody.reused).toBe(false);

    const secondPair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-reuse',
        agentId: 'codex-agent-reuse',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-reuse',
        capabilities: ['plan', 'execute'],
        metadata: { reconnectCount: 1 },
      }),
    });
    expect(secondPair.status).toBe(200);
    const secondBody = await secondPair.json();
    expect(secondBody.reused).toBe(true);
    expect(secondBody.token).toBe(firstBody.token);
    expect(secondBody.durableIdentity).toBe(firstBody.durableIdentity);
    expect(secondBody.capabilities).toEqual(['plan', 'execute']);
    expect(secondBody.normalizedCapabilities).toEqual(['execute', 'plan']);
    expect(secondBody.metadata).toEqual({ reconnectCount: 1 });

    const sessions = await fetch(`${baseUrl}/api/a2a/bridge/sessions`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(sessions.status).toBe(200);
    const sessionsBody = await sessions.json();
    const reusedSessions = sessionsBody.sessions.filter((s: any) => s.bridgeId === 'bridge-reuse');
    expect(reusedSessions).toHaveLength(1);
    expect(reusedSessions[0].durableIdentity).toBe(firstBody.durableIdentity);
    expect(reusedSessions[0].capabilities).toEqual(['plan', 'execute']);
    expect(reusedSessions[0].normalizedCapabilities).toEqual(['execute', 'plan']);
    expect(reusedSessions[0].metadata).toEqual({ reconnectCount: 1 });

    const registryAgent = getAgentRegistryService().getWithHealth('codex-agent-reuse');
    expect(registryAgent?.card.skills.map((skill) => skill.id)).toEqual(['execute', 'plan']);
    expect(registryAgent?.lifecycle.registrationCount).toBe(2);
    expect(registryAgent?.lifecycle.reconnectCount).toBe(1);
  });

  it('prefers registry-backed identity over stale bridge session metadata in session visibility', async () => {
    const workspace = createWorkspace(['codex-agent-visibility'], 'proj-visibility');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-visibility',
        agentId: 'codex-agent-visibility',
        agentName: 'Stale Bridge Alias',
        agentPlatform: 'codex',
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        capabilities: ['plan'],
      }),
    });
    expect(pair.status).toBe(201);

    getAgentRegistryService().selfRegister({
      agentId: 'codex-agent-visibility',
      name: 'Canonical Registry Agent',
      platform: 'codex',
      tags: ['canonical'],
      skills: [{ id: 'execute', name: 'execute', description: 'execute', tags: ['execute'] }],
    });

    const sessions = await fetch(`${baseUrl}/api/a2a/bridge/sessions`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(sessions.status).toBe(200);
    const sessionsBody = await sessions.json();
    const session = sessionsBody.sessions.find((row: any) => row.bridgeId === 'bridge-visibility');
    expect(session.agentName).toBe('Canonical Registry Agent');
    expect(session.agentPlatform).toBe('codex');
  });

  it('rejects bridge session registry binding when an existing agent platform conflicts', async () => {
    getAgentRegistryService().selfRegister({
      agentId: 'conflict-agent',
      name: 'Conflict Agent',
      platform: 'claude_code',
    });
    const workspace = createWorkspace(['conflict-agent'], 'proj-conflict');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-platform-conflict',
        agentId: 'conflict-agent',
        agentPlatform: 'codex',
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
      }),
    });
    expect(pair.status).toBe(409);
    const body = await pair.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('platform mismatch');
  });

  it('rejects bridge session binding for unknown workspace', async () => {
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-missing-workspace',
        agentId: 'agent-missing-workspace',
        workspaceId: 'ws-does-not-exist',
      }),
    });
    expect(pair.status).toBe(404);
    const body = await pair.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Workspace not found');
  });

  it('rejects bridge session binding when the agent is not a workspace member', async () => {
    const workspace = createWorkspace(['agent-a'], 'proj-membership');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-membership',
        agentId: 'agent-b',
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
      }),
    });
    expect(pair.status).toBe(403);
    const body = await pair.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('is not a member');
  });

  it('rejects bridge session binding when workspace and project do not match', async () => {
    const workspace = createWorkspace(['agent-project'], 'proj-correct');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-project-mismatch',
        agentId: 'agent-project',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-wrong',
      }),
    });
    expect(pair.status).toBe(409);
    const body = await pair.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('projectId mismatch');
  });

  it('rejects conflicting durable identity claims across bridge sessions', async () => {
    const workspace = createWorkspace(['agent-conflict'], 'proj-conflict-identity');
    const otherWorkspace = createWorkspace(['agent-conflict'], 'proj-conflict-identity');
    const firstPair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-conflict-a',
        agentId: 'agent-conflict',
        agentPlatform: 'codex',
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
      }),
    });
    expect(firstPair.status).toBe(201);

    const secondPair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-conflict-b',
        agentId: 'agent-conflict',
        agentPlatform: 'codex',
        workspaceId: otherWorkspace.workspaceId,
        projectId: workspace.projectId,
      }),
    });
    expect(secondPair.status).toBe(409);
    const body = await secondPair.json();
    expect(body.error).toContain('Conflicting workspace claim');
    expect(body.a2aError.code).toBe('INVALID_STATE_TRANSITION');
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
          from: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
          to: { id: 'web', platform: 'recoder_app' },
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
          to: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
    const workspace = createWorkspace(['codex-agent-heartbeat'], 'proj-heartbeat');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        agentId: 'codex-agent-heartbeat',
        agentPlatform: 'codex',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-heartbeat',
      }),
    });
    expect(pair.status).toBe(201);
    const pairBody = await pair.json();

    const response = await fetch(`${baseUrl}/api/a2a/bridge/heartbeat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${pairBody.token}`,
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
    expect(singleBody.heartbeat.agentId).toBe('codex-agent-heartbeat');
    expect(singleBody.heartbeat.workspaceId).toBe(workspace.workspaceId);
    expect(singleBody.heartbeat.projectId).toBe('proj-heartbeat');
    expect(getAgentRegistryService().getWithHealth('codex-agent-heartbeat')?.health.online).toBe(true);

    const status = await fetch(`${baseUrl}/api/a2a/bridge/status`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(status.status).toBe(200);
    const statusBody = await status.json();
    expect(statusBody.ok).toBe(true);
    expect(Array.isArray(statusBody.bridges)).toBe(true);
    expect(statusBody.bridges.some((row: any) => row.bridgeId === 'bridge-default')).toBe(true);
  });

  it('rejects heartbeat ownership mismatches for paired bridge sessions', async () => {
    const workspace = createWorkspace(['codex-agent-bound'], 'proj-bound');
    const pair = await fetch(`${baseUrl}/api/a2a/bridge/pair`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-recoder-a2a-admin-token': 'admin-token',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        agentId: 'codex-agent-bound',
        workspaceId: workspace.workspaceId,
        projectId: 'proj-bound',
      }),
    });
    expect(pair.status).toBe(201);
    const pairBody = await pair.json();

    const response = await fetch(`${baseUrl}/api/a2a/bridge/heartbeat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${pairBody.token}`,
        'content-type': 'application/json',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
      body: JSON.stringify({
        bridgeId: 'bridge-default',
        agentId: 'codex-agent-other',
      }),
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('agentId');
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
          from: { id: 'web', platform: 'recoder_app' },
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

  it('records bridge result lifecycle and evidence in orchestration history', async () => {
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
          messageId: 'msg-orch-history',
          threadId: 'thread-orch-history',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_app' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'collect bridge evidence' }],
          metadata: { traceId: 'trace-orch-history', workspaceId: 'ws-orch-history' },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const next = await fetch(`${baseUrl}/api/a2a/bridge/jobs/next`, {
      headers: {
        authorization: 'Bearer bridge-token',
        'x-recoder-a2a-bridge-id': 'bridge-default',
      },
    });
    expect(next.status).toBe(200);
    const job = await next.json();

    const result = await fetch(`${baseUrl}/api/a2a/bridge/jobs/${job.jobId}/result`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        previewUrl: 'https://preview.recoder.xyz/orch-history',
        gitStatus: 'M src/kernel.ts',
        resultEnvelope: {
          messageId: 'msg-orch-history-result',
          threadId: 'thread-orch-history',
          intent: 'tool_result',
          from: { id: 'codex', platform: 'codex' },
          to: { id: 'web', platform: 'recoder_app' },
          payload: [{ kind: 'text', text: 'done' }],
          metadata: {
            workspaceId: 'ws-orch-history',
            traceId: 'trace-orch-history',
          },
        },
      }),
    });
    expect(result.status).toBe(200);

    const history = await fetch(`${baseUrl}/api/a2a/orchestrate/thread-orch-history/trace-orch-history/history`, {
      headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
    });
    expect(history.status).toBe(200);
    const body = await history.json();
    expect(body.ok).toBe(true);
    expect(body.workspaceId).toBe('ws-orch-history');
    expect(body.summary.lifecycleCount).toBeGreaterThanOrEqual(3);
    expect(body.summary.evidenceCount).toBeGreaterThanOrEqual(2);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'bridge.result.accepted')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'preview')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'runtime')).toBe(true);
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
          from: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
          from: { id: 'web', platform: 'recoder_app' },
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
