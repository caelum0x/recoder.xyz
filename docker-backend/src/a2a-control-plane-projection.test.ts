import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { __resetA2ATestState, a2aRouter } from './a2a-gateway';
import {
  getTaskLifecycleService,
  resetA2AEventBridge,
  resetTaskLifecycleService,
  wireA2AEventBridge,
} from './a2a';

const realFetch = globalThis.fetch;

async function waitFor(
  predicate: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1500;
  const intervalMs = options.intervalMs ?? 25;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

describe('A2A control-plane task projection', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let baseUrl = '';

  async function startServer() {
    const app = express();
    app.use('/api/a2a', express.text({ type: 'application/json' }));
    app.use('/api/a2a', a2aRouter);
    return await new Promise<any>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
  }

  beforeEach(async () => {
    globalThis.fetch = realFetch;
    process.env.RECODER_A2A_ADMIN_TOKEN = 'admin-token';
    process.env.RECODER_A2A_ENABLE_CODEX = 'true';
    process.env.RECODER_A2A_ENABLE_CLAUDE_CODE = 'true';
    process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK = 'true';
    process.env.RECODER_A2A_CODEX_BASE_URL = '';
    process.env.RECODER_A2A_CLAUDE_CODE_BASE_URL = '';
    process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS = 'plan,execute,handoff,tool_call';
    delete process.env.RECODER_A2A_REDIS_URL;
    delete process.env.REDIS_URL;

    resetA2AEventBridge();
    resetTaskLifecycleService();
    __resetA2ATestState();

    server = await startServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    wireA2AEventBridge();
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    resetA2AEventBridge();
    resetTaskLifecycleService();
    __resetA2ATestState();
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('projects task lifecycle transitions and derived evidence into orchestration history', async () => {
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
          messageId: 'msg-control-plane-projection',
          threadId: 'thread-control-plane-projection',
          intent: 'execute',
          from: { id: 'web', platform: 'recoder_web' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'ship a patch' }],
          metadata: {
            workspaceId: 'ws-control-plane-projection',
            traceId: 'trace-control-plane-projection',
          },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const lifecycle = getTaskLifecycleService();
    const created = lifecycle.createTask({
      workspace_id: 'ws-control-plane-projection',
      thread_id: 'thread-control-plane-projection',
      trace_id: 'trace-control-plane-projection',
      requester: {
        agent_id: 'recoder_web',
        platform: 'recoder_web',
      },
      assignee: {
        agent_id: 'codex',
        platform: 'codex',
      },
      connector: {
        connector_id: 'codex:codex',
        platform: 'codex',
        protocol: 'a2a',
      },
      payload: [{ kind: 'text', text: 'Implement the requested change' }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const taskId = created.data.id;
    expect(lifecycle.startTask(taskId, 'codex').ok).toBe(true);

    const completed = lifecycle.completeTask(
      taskId,
      {
        data: {
          previewUrl: 'https://preview.recoder.xyz/control-plane',
          gitBranch: 'feature/control-plane-history',
          gitStatus: 'M src/control-plane.ts',
          cloneUrl: 'https://github.com/recoder/recoder.xyz.git',
          runtimeType: 'codex',
          sessionId: 'runtime-session-1',
          stdout: ['building project', 'tests passed'],
          filesChanged: ['src/control-plane.ts'],
        },
        artifacts: [
          {
            key: 'patch-1',
            artifact_type: 'patch',
            path: 'artifacts/patch.diff',
          },
        ],
      },
      'codex',
    );
    expect(completed.ok).toBe(true);

    await waitFor(async () => {
      const history = await fetch(
        `${baseUrl}/api/a2a/orchestrate/thread-control-plane-projection/trace-control-plane-projection/history`,
        {
          headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
        },
      );
      if (history.status !== 200) return false;
      const body = await history.json();
      return (
        body.lifecycle.some((entry: any) => entry.eventType === 'task.completed') &&
        body.evidence.some((entry: any) => entry.kind === 'preview') &&
        body.evidence.some((entry: any) => entry.kind === 'log') &&
        body.evidence.some((entry: any) => entry.kind === 'runtime') &&
        body.evidence.some((entry: any) => entry.kind === 'artifact') &&
        body.evidence.some((entry: any) => entry.kind === 'file-change')
      );
    });

    const history = await fetch(
      `${baseUrl}/api/a2a/orchestrate/thread-control-plane-projection/trace-control-plane-projection/history`,
      {
        headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
      },
    );
    expect(history.status).toBe(200);
    const body = await history.json();
    expect(body.ok).toBe(true);
    expect(body.summary.lifecycleCount).toBeGreaterThanOrEqual(3);
    expect(body.summary.evidenceCount).toBeGreaterThanOrEqual(5);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'task.submitted')).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'task.started')).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'task.completed')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'preview' && entry.ref === 'https://preview.recoder.xyz/control-plane')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'runtime' && entry.ref === 'git:feature/control-plane-history')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'runtime' && entry.ref === 'runtime-session-1')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'log' && entry.ref === 'stdout')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'artifact' && entry.ref === 'patch-1')).toBe(true);
    expect(body.evidence.some((entry: any) => entry.kind === 'file-change' && entry.ref === 'src/control-plane.ts')).toBe(true);
    expect(body.timeline.some((entry: any) => entry.type === 'task.completed')).toBe(true);
    expect(body.timeline.some((entry: any) => entry.type === 'evidence.attached')).toBe(true);
  });

  it('projects metadata patch milestones into orchestration history', async () => {
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
          messageId: 'msg-control-plane-metadata',
          threadId: 'thread-control-plane-metadata',
          intent: 'execute',
          from: { id: 'pm', platform: 'recoder_pm' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'route then review' }],
          metadata: {
            workspaceId: 'ws-control-plane-metadata',
            traceId: 'trace-control-plane-metadata',
          },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const lifecycle = getTaskLifecycleService();
    const created = lifecycle.createTask({
      workspace_id: 'ws-control-plane-metadata',
      thread_id: 'thread-control-plane-metadata',
      trace_id: 'trace-control-plane-metadata',
      requester: {
        agent_id: 'recoder_pm',
        platform: 'recoder_pm',
      },
      assignee: {
        agent_id: 'codex',
        platform: 'codex',
      },
      connector: {
        connector_id: 'codex:codex',
        platform: 'codex',
        protocol: 'a2a',
      },
      payload: [{ kind: 'text', text: 'metadata projection task' }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const taskId = created.data.id;
    const updated = lifecycle.updateTaskMetadata(taskId, {
      metadataPatch: {
        approval: {
          approvalId: 'approval-metadata-1',
          status: 'pending',
          action: 'review',
        },
        handoff: {
          status: 'review-accepted',
          intent: 'review',
          reviewTarget: 'src/editor.ts',
        },
        merge: {
          status: 'merge-requested',
          branchName: 'feat/control-plane',
          baseBranch: 'main',
        },
        routing: {
          runtimeCategory: 'code',
          selectedBy: 'capability-matcher',
        },
      },
      triggeredBy: 'recoder-pm',
      reason: 'Metadata milestone projection',
    });
    expect(updated.ok).toBe(true);

    await waitFor(async () => {
      const history = await fetch(
        `${baseUrl}/api/a2a/orchestrate/thread-control-plane-metadata/trace-control-plane-metadata/history`,
        {
          headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
        },
      );
      if (history.status !== 200) return false;
      const body = await history.json();
      const eventTypes = body.lifecycle.map((entry: any) => entry.eventType);
      return (
        eventTypes.includes('task.approval.updated') &&
        eventTypes.includes('review.accepted') &&
        eventTypes.includes('merge.requested') &&
        eventTypes.includes('task.routing.updated')
      );
    });

    const history = await fetch(
      `${baseUrl}/api/a2a/orchestrate/thread-control-plane-metadata/trace-control-plane-metadata/history`,
      {
        headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
      },
    );
    expect(history.status).toBe(200);
    const body = await history.json();
    expect(body.ok).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'task.approval.updated')).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'review.accepted')).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'merge.requested')).toBe(true);
    expect(body.lifecycle.some((entry: any) => entry.eventType === 'task.routing.updated')).toBe(true);
  });

  it('projects task claim ownership into orchestration history', async () => {
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
          messageId: 'msg-control-plane-claim',
          threadId: 'thread-control-plane-claim',
          intent: 'execute',
          from: { id: 'pm', platform: 'recoder_pm' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'claim the task' }],
          metadata: {
            workspaceId: 'ws-control-plane-claim',
            traceId: 'trace-control-plane-claim',
          },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const lifecycle = getTaskLifecycleService();
    const created = lifecycle.createTask({
      workspace_id: 'ws-control-plane-claim',
      thread_id: 'thread-control-plane-claim',
      trace_id: 'trace-control-plane-claim',
      requester: {
        agent_id: 'recoder_pm',
        platform: 'recoder_pm',
      },
      assignee: {
        agent_id: 'codex',
        platform: 'codex',
      },
      connector: {
        connector_id: 'codex:codex',
        platform: 'codex',
        protocol: 'a2a',
      },
      payload: [{ kind: 'text', text: 'claim ownership task' }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const claim = lifecycle.claimTask(created.data.id, 'bridge-session-claim-1', 'codex');
    expect(claim.ok).toBe(true);

    await waitFor(async () => {
      const history = await fetch(
        `${baseUrl}/api/a2a/orchestrate/thread-control-plane-claim/trace-control-plane-claim/history`,
        {
          headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
        },
      );
      if (history.status !== 200) return false;
      const body = await history.json();
      return body.lifecycle.some((entry: any) => entry.eventType === 'task.claimed');
    });

    const history = await fetch(
      `${baseUrl}/api/a2a/orchestrate/thread-control-plane-claim/trace-control-plane-claim/history`,
      {
        headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
      },
    );
    expect(history.status).toBe(200);
    const body = await history.json();
    const claimEvent = body.lifecycle.find((entry: any) => entry.eventType === 'task.claimed');
    expect(claimEvent).toBeTruthy();
    expect(claimEvent.detail.agentId).toBe('codex');
    expect(typeof claimEvent.detail.sessionId).toBe('string');
    expect(claimEvent.detail.sessionId.length).toBeGreaterThan(0);
  });
});
