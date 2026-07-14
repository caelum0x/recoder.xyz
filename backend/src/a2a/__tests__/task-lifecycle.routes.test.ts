import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const bridgeAgent = { status: 'online' as 'online' | 'working' | 'idle' };
  const bridge = {
    isAgentOnline: vi.fn(() => false),
    sendToAgent: vi.fn(() => true),
    getAgent: vi.fn(() => bridgeAgent),
    getSessionsForAgent: vi.fn(() => []),
  };

  const memory = {
    getRecentContext: vi.fn(async () => []),
    rememberEntry: vi.fn(async (params: { content: string; type: string; tags: string[]; agentId: string; userId: string }) => ({
      id: 'mem_approved_1',
      content: params.content,
      type: params.type,
      tags: params.tags,
      agentId: params.agentId,
      userId: params.userId,
      createdAt: '2026-06-06T00:00:00.000Z',
    })),
  };

  return { bridge, bridgeAgent, memory };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('../agent-bridge.service', () => ({
  getAgentBridgeService: () => mocks.bridge,
}));

vi.mock('../memory-store', () => ({
  getRecentContext: (...args: unknown[]) => mocks.memory.getRecentContext(...args),
  rememberEntry: (...args: unknown[]) => mocks.memory.rememberEntry(...args),
}));

import type { Router } from 'express';
import { taskLifecycleRouter } from '../task-lifecycle.routes';
import { getTaskLifecycleService, resetTaskLifecycleService } from '../task-lifecycle.service';
import { getApprovalGateService, resetApprovalGateService } from '../approval-gate.service';
import { getDelegationChainService, resetDelegationChainService } from '../delegation-chain.service';
import { resetMemoryCandidateService } from '../memory-candidate.service';
import { resetPreviewDeploymentService } from '../../edge/preview-deployment.service';

type MockReq = EventEmitter & {
  method: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

function makeReq(opts: {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'GET';
  emitter.body = opts.body ?? {};
  emitter.params = opts.params ?? {};
  emitter.query = opts.query ?? {};
  emitter.headers = opts.headers ?? {};
  return emitter;
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = {
    statusCode: 200,
    jsonData: null as any,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };

  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
  const middleware = router.stack.filter((l: any) => !l.route).map((l: any) => l.handle);
  const routeLayer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const routeHandlers = routeLayer.route.stack.map((l: any) => l.handle);
  return [...middleware, ...routeHandlers];
}

async function runStack(
  router: Router,
  path: string,
  method: 'post' | 'get',
  req: MockReq,
  res: any,
): Promise<void> {
  const handlers = getRouteStack(router, path, method);

  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        nextCalled = true;
        resolve({ nextCalled: true });
      };

      try {
        const out = handler(req, res, next);
        Promise.resolve(out)
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });

    if (!result.nextCalled) break;
  }
}

describe('taskLifecycleRouter bridge dispatch', () => {
  beforeEach(() => {
    resetTaskLifecycleService();
    resetApprovalGateService();
    resetDelegationChainService();
    resetMemoryCandidateService();
    resetPreviewDeploymentService();
    vi.clearAllMocks();
    mocks.bridgeAgent.status = 'online';
    mocks.bridge.getAgent.mockReturnValue(mocks.bridgeAgent);
    mocks.bridge.sendToAgent.mockReturnValue(true);
  });

  it('dispatches REST-created MCP tasks to online bridge agents', async () => {
    mocks.bridge.isAgentOnline.mockReturnValue(true);

    const req = makeReq({
      method: 'POST',
      body: {
        workspace_id: 'ws_default',
        thread_id: 'thread_123',
        requester: { agent_id: 'claude_code', platform: 'claude_code' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'mcp-bridge', platform: 'recoder', protocol: 'websocket' },
        payload: { intent: 'execute', task: 'hello from claude' },
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(mocks.bridge.sendToAgent).toHaveBeenCalledTimes(1);
    expect(mocks.bridge.sendToAgent).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        type: 'task.assigned',
        prompt: expect.stringContaining('Read AGENTS.md as canonical policy'),
        intent: 'execute',
        context: expect.objectContaining({
          source: 'a2a-rest',
          from: 'claude_code',
          workspace_id: 'ws_default',
          thread_id: 'thread_123',
          instructionBundle: expect.objectContaining({
            shared_goal: 'hello from claude',
            system_context_refs: expect.arrayContaining([
              expect.objectContaining({ path: 'AGENTS.md' }),
              expect.objectContaining({ path: '.codex/AGENTS.md' }),
            ]),
          }),
        }),
      }),
    );
    expect(mocks.bridgeAgent.status).toBe('working');
  });

  it('does not dispatch REST-created tasks when the assignee is offline', async () => {
    mocks.bridge.isAgentOnline.mockReturnValue(false);

    const req = makeReq({
      method: 'POST',
      body: {
        workspace_id: 'ws_default',
        thread_id: 'thread_123',
        requester: { agent_id: 'claude_code', platform: 'claude_code' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'mcp-bridge', platform: 'recoder', protocol: 'websocket' },
        payload: { kind: 'text', text: 'plain text payload' },
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(mocks.bridge.sendToAgent).not.toHaveBeenCalled();
    expect(mocks.bridgeAgent.status).toBe('online');
  });

  it('returns unified task context with audit, approval, and delegation linkage', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_ctx',
      thread_id: 'thread_ctx',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Context task' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const approval = getApprovalGateService().createRequest({
      workspaceId: 'ws_ctx',
      requestingAgentId: 'agent-a',
      targetAgentId: 'agent-b',
      action: 'delegate',
      details: { sourceTaskId: created.data.id },
      timeoutMs: 10_000,
    });
    const delegation = getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'Please handle this',
      metadata: {
        sourceTaskId: created.data.id,
        approvalId: approval.approvalId,
      },
    });

    service.updateTaskMetadata(created.data.id, {
      metadataPatch: {
        approval: { approvalId: approval.approvalId, status: approval.status },
        handoff: { delegationId: delegation.delegationId, status: delegation.status },
      },
      triggeredBy: 'test',
      reason: 'Link approval and delegation',
    });

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.task.id).toBe(created.data.id);
    expect(state.jsonData.data.links.approval.approvalId).toBe(approval.approvalId);
    expect(state.jsonData.data.links.delegation.delegationId).toBe(delegation.delegationId);
    expect(state.jsonData.data.links.delegationChain.rootDelegationId).toBe(delegation.delegationId);
    expect(Array.isArray(state.jsonData.data.audit)).toBe(true);
    expect(state.jsonData.data.assignee.agentId).toBe('agent-b');
    expect(Array.isArray(state.jsonData.data.assignee.localBridgeSessions)).toBe(true);
    expect(Array.isArray(state.jsonData.data.assignee.pairedBridgeSessions)).toBe(true);
    expect(state.jsonData.data.runtime.evidenceCount).toBe(0);
  });

  it('returns delivery metadata for attached GitHub PRs and preview deployments', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_delivery',
      thread_id: 'thread_delivery',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Delivery task' },
      metadata: {
        githubPullRequest: {
          projectId: 'project-123',
          repo: 'recoder/recoder.xyz',
          prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
          prNumber: 42,
          state: 'open',
          title: 'Add shared timeline delivery UI',
          head: 'feature/pr-ui',
          base: 'main',
          draft: false,
        },
        deploymentPreview: {
          deploymentId: 'deploy-123',
          projectId: 'project-123',
          protectedPreviewUrl: 'https://preview.recoder.xyz/access/deploy-123',
          basePreviewUrl: 'https://preview.recoder.xyz/deploy-123',
          protectionMode: 'signed',
          edgeHost: 'preview.recoder.xyz',
          prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
          prNumber: 42,
          branchName: 'feature/pr-ui',
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    service.appendTaskArtifacts(created.data.id, {
      triggeredBy: 'test',
      reason: 'Attach PR artifact',
      artifacts: [
        {
          key: 'github-pr-42',
          artifact_type: 'custom',
          mime_type: 'application/json',
          content: JSON.stringify({ type: 'github_pull_request', prNumber: 42 }),
          metadata: {
            type: 'github_pull_request',
            title: 'Add shared timeline delivery UI',
            prNumber: 42,
            prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
          },
        },
      ],
    });

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.delivery.githubPullRequest).toMatchObject({
      prNumber: 42,
      repo: 'recoder/recoder.xyz',
      state: 'open',
    });
    expect(state.jsonData.data.delivery.previewDeployment).toMatchObject({
      deploymentId: 'deploy-123',
      prNumber: 42,
      protectionMode: 'signed',
    });
    expect(
      state.jsonData.data.timeline.some((entry: any) => entry.type === 'github.pull_request' && String(entry.detail).includes('#42')),
    ).toBe(true);
  });

  it('returns compiled instruction bundle provenance and verification details in task context', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_instructions',
      thread_id: 'thread_instructions',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Compile instruction context' },
      metadata: {
        instructionBundle: {
          sharedGoal: 'Compile instruction context',
          verificationCommands: ['pnpm test'],
          provenance: {
            compilerVersion: '0.1.0',
            compiledAt: '2026-06-06T00:00:00.000Z',
          },
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    service.appendTaskArtifacts(created.data.id, {
      triggeredBy: 'test',
      reason: 'Attach compiled instruction bundle',
      artifacts: [
        {
          key: `instruction-bundle:${created.data.id}`,
          artifact_type: 'custom',
          mime_type: 'application/json',
          path: `.recoder/artifacts/instruction-bundle-${created.data.id}.json`,
          content: JSON.stringify({
            shared_goal: 'Compile instruction context',
            agent_specific_prompt: 'Read AGENTS.md and compile the task.',
            system_context_refs: [
              { ref_id: 'AGENTS.md', kind: 'agents_md', path: 'AGENTS.md', sha: 'abc123' },
              { ref_id: '.codex/AGENTS.md', kind: 'codex_override', path: '.codex/AGENTS.md', sha: 'def456' },
            ],
            acceptance_criteria: ['Instruction bundle visible in context'],
            verification_commands: ['pnpm test', 'pnpm check-types'],
            forbidden_actions: ['Do not modify .env*'],
            approval_gates: [
              {
                approval_id: 'approval-1',
                title: 'Push approval',
                status: 'pending',
                required_at: 'before_push',
                reason: 'Push approval required',
              },
            ],
            memory_used: [
              {
                memory_id: 'memory-1',
                scope: 'repo',
                title: 'Use pnpm test',
              },
            ],
            provenance: {
              source_files: [
                { path: 'AGENTS.md', sha: 'abc123' },
                { path: '.codex/AGENTS.md', sha: 'def456' },
              ],
              compiled_at: '2026-06-06T00:00:00.000Z',
              compiler_version: '0.1.0',
            },
          }),
        },
      ],
    });

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.data.instructions).toMatchObject({
      sharedGoal: 'Compile instruction context',
      compilerVersion: '0.1.0',
      compiledAt: '2026-06-06T00:00:00.000Z',
      artifactKey: `instruction-bundle:${created.data.id}`,
    });
    expect(state.jsonData.data.instructions.verificationCommands).toEqual([
      'pnpm test',
      'pnpm check-types',
    ]);
    expect(state.jsonData.data.instructions.sourceFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'AGENTS.md', sha: 'abc123' }),
        expect.objectContaining({ path: '.codex/AGENTS.md', sha: 'def456' }),
      ]),
    );
    expect(
      state.jsonData.data.timeline.some((entry: any) => entry.type === 'instructions.compiled'),
    ).toBe(true);
  });

  it('proposes, approves, and exposes reviewed memory candidates in task context', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_memory',
      thread_id: 'thread_memory',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Remember the repo build command' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const proposeReq = makeReq({
      method: 'POST',
      params: { taskId: created.data.id },
      body: {
        scope: 'repo',
        title: 'recoder-web build command',
        body: 'Use `pnpm -F recoder-web build` for production route validation.',
        evidence: { artifactId: 'artifact_test_output_1' },
        proposedBy: 'codex',
        agentId: 'codex',
        userId: 'user-123',
      },
    });
    const proposeRes = makeRes();
    await runStack(taskLifecycleRouter, '/:taskId/memory-candidates', 'post', proposeReq, proposeRes.res);

    expect(proposeRes.state.statusCode).toBe(201);
    const candidateId = proposeRes.state.jsonData.data.candidateId as string;
    expect(candidateId).toMatch(/^memory_candidate_/);

    const approveReq = makeReq({
      method: 'POST',
      params: { taskId: created.data.id, candidateId },
      body: {
        reviewedBy: 'pm-agent',
        reviewReason: 'Verified against task evidence',
      },
    });
    const approveRes = makeRes();
    await runStack(
      taskLifecycleRouter,
      '/:taskId/memory-candidates/:candidateId/approve',
      'post',
      approveReq,
      approveRes.res,
    );

    expect(approveRes.state.statusCode).toBe(200);
    expect(mocks.memory.rememberEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Use `pnpm -F recoder-web build` for production route validation.',
        userId: 'user-123',
        agentId: 'codex',
      }),
    );
    expect(approveRes.state.jsonData.data).toMatchObject({
      status: 'approved',
      reviewedBy: 'pm-agent',
      approvedMemoryId: 'mem_approved_1',
    });

    const contextReq = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const contextRes = makeRes();
    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', contextReq, contextRes.res);

    expect(contextRes.state.statusCode).toBe(200);
    expect(contextRes.state.jsonData.data.memoryCandidates).toEqual([
      expect.objectContaining({
        candidateId,
        scope: 'repo',
        title: 'recoder-web build command',
        status: 'approved',
        approvedMemoryId: 'mem_approved_1',
      }),
    ]);
  });

  it('auto-proposes pending memory candidates from structured completion results', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_memory_auto',
      thread_id: 'thread_memory_auto',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Complete task and propose memory' },
      metadata: {
        userId: 'user-456',
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const started = service.startTask(created.data.id, 'codex');
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const completed = service.completeTask(
      created.data.id,
      {
        text: 'Done',
        data: {
          memoryCandidate: {
            scope: 'repo',
            title: 'preferred typecheck command',
            body: 'Use `pnpm check-types` before delivery.',
            artifactId: 'artifact_test_output_auto',
          },
        },
      },
      'codex',
    );

    expect(completed.ok).toBe(true);
    expect(mocks.memory.rememberEntry).not.toHaveBeenCalled();

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();
    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.data.memoryCandidates).toEqual([
      expect.objectContaining({
        scope: 'repo',
        title: 'preferred typecheck command',
        body: 'Use `pnpm check-types` before delivery.',
        status: 'pending',
      }),
    ]);
    expect(
      (state.jsonData.data.runtime?.artifacts ?? []).some((artifact: any) =>
        String(artifact.key).startsWith('memory-candidate:'),
      ),
    ).toBe(true);
  });

  it('returns delivery metadata for linked GitHub issues', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_issue_delivery',
      thread_id: 'thread_issue_delivery',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Issue-linked task' },
      metadata: {
        githubIssue: {
          issueUrl: 'https://github.com/recoder/recoder.xyz/issues/7',
          issueNumber: 7,
          title: 'Link task delivery state to issue',
          repo: 'recoder/recoder.xyz',
          state: 'open',
          labels: ['launch-gate', 'github'],
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    service.appendTaskArtifacts(created.data.id, {
      triggeredBy: 'test',
      reason: 'Attach issue artifact',
      artifacts: [
        {
          key: 'github-issue-7',
          artifact_type: 'custom',
          mime_type: 'application/json',
          content: JSON.stringify({ type: 'github_issue', issueNumber: 7 }),
          metadata: {
            type: 'github_issue',
            title: 'Link task delivery state to issue',
            issueNumber: 7,
            issueUrl: 'https://github.com/recoder/recoder.xyz/issues/7',
          },
        },
      ],
    });

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.delivery.githubIssue).toMatchObject({
      issueNumber: 7,
      repo: 'recoder/recoder.xyz',
      state: 'open',
    });
    expect(
      state.jsonData.data.timeline.some((entry: any) => entry.type === 'github.issue' && String(entry.detail).includes('#7')),
    ).toBe(true);
  });

  it('appends review history entries when review metadata is updated', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_review_history',
      thread_id: 'thread_review_history',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Review task' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const req = makeReq({
      method: 'POST',
      params: { taskId: created.data.id },
      body: {
        metadataPatch: {
          handoff: {
            status: 'review-accepted',
            intent: 'review',
            reviewTarget: 'recoder/task-branch',
          },
          merge: {
            status: 'merge-requested',
            branchName: 'recoder/task-branch',
            baseBranch: 'main',
            suggestedAction: 'merge-worktree-branch',
          },
        },
        reason: 'Mission Control accepted review and requested merge',
        triggeredBy: 'recoder-agents-mission-control',
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/metadata', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(Array.isArray(state.jsonData.data.metadata.reviewHistory)).toBe(true);
    expect(state.jsonData.data.metadata.reviewHistory).toHaveLength(2);
    expect(state.jsonData.data.metadata.reviewHistory[0]).toMatchObject({
      type: 'review.accepted',
      actor: 'recoder-agents-mission-control',
    });
    expect(state.jsonData.data.metadata.reviewHistory[1]).toMatchObject({
      type: 'merge.requested',
      branchName: 'recoder/task-branch',
    });
  });

  it('appends task artifacts via route', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_artifacts',
      thread_id: 'thread_artifacts',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Artifact task' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const req = makeReq({
      method: 'POST',
      params: { taskId: created.data.id },
      body: {
        artifacts: [
          {
            key: 'manual-report.md',
            artifact_type: 'report',
            mime_type: 'text/markdown',
            content: '# Manual report',
            path: '.recoder/artifacts/manual-report.md',
          },
        ],
        reason: 'Manual artifact upload',
        triggeredBy: 'recoder-code-cli',
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/artifacts', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.result.artifacts).toHaveLength(1);
    expect(state.jsonData.data.result.artifacts[0]).toMatchObject({
      key: 'manual-report.md',
      artifact_type: 'report',
    });
  });

  it('creates a protected preview deployment and attaches it to the task', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_preview_deploy',
      thread_id: 'thread_preview_deploy',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Preview deploy task' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const req = makeReq({
      method: 'POST',
      params: { taskId: created.data.id },
      body: {
        projectId: 'project-preview-123',
        branchName: 'feature/preview',
        prNumber: 42,
        prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
        createdBy: 'recoder-agents',
        protectionMode: 'signed',
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/preview-deploy', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.previewDeployment).toMatchObject({
      projectId: 'project-preview-123',
      protectionMode: 'signed',
      branchName: 'feature/preview',
      prNumber: 42,
    });
    expect(state.jsonData.data.previewDeployment.protectedPreviewUrl).toContain('/preview-access/');
    expect(state.jsonData.data.task.result.artifacts.some((artifact: any) => artifact.key.includes('preview-deployment:'))).toBe(true);
    expect(state.jsonData.data.task.result.evidence.some((item: any) => item.kind === 'preview')).toBe(true);
    expect(state.jsonData.data.task.metadata.deploymentPreview).toMatchObject({
      projectId: 'project-preview-123',
      protectionMode: 'signed',
      prNumber: 42,
    });
  });
});
