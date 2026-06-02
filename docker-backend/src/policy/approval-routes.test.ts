import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { a2aRouter, __resetA2ATestState } from '../a2a-gateway';
import {
  getTaskLifecycleService,
  resetA2AEventBridge,
  resetTaskLifecycleService,
  taskLifecycleRouter,
  wireA2AEventBridge,
} from '../a2a';
import { approvalRouter, clearAllApprovals } from './index';

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

describe('policy approval routes', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let baseUrl = '';

  async function startServer() {
    const app = express();
    app.use(express.json());
    app.use('/api/a2a', express.text({ type: 'application/json' }));
    app.use('/api/a2a', a2aRouter);
    app.use('/api/a2a/tasks', taskLifecycleRouter);
    app.use('/api/a2a/approvals', approvalRouter);
    return await new Promise<any>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
  }

  beforeEach(async () => {
    globalThis.fetch = realFetch;
    process.env.RECODER_A2A_ADMIN_TOKEN = 'admin-token';
    process.env.RECODER_A2A_ENABLE_CODEX = 'true';
    process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK = 'true';
    process.env.RECODER_A2A_CODEX_BASE_URL = '';
    process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS = 'plan,execute,handoff,tool_call';
    delete process.env.RECODER_A2A_REDIS_URL;
    delete process.env.REDIS_URL;

    clearAllApprovals();
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
    clearAllApprovals();
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

  it('syncs created and revoked policy approvals into task context and orchestration history', async () => {
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
          messageId: 'msg-policy-approval-context',
          threadId: 'thread-policy-approval-context',
          intent: 'execute',
          from: { id: 'pm', platform: 'recoder_pm' },
          to: { id: 'codex', platform: 'codex' },
          payload: [{ kind: 'text', text: 'needs approval' }],
          metadata: {
            workspaceId: 'ws-policy-approval-context',
            traceId: 'trace-policy-approval-context',
          },
        },
      }),
    });
    expect(orchestrate.status).toBe(202);

    const createdTask = getTaskLifecycleService().createTask({
      workspace_id: 'ws-policy-approval-context',
      thread_id: 'thread-policy-approval-context',
      trace_id: 'trace-policy-approval-context',
      requester: { agent_id: 'recoder_pm', platform: 'recoder_pm' },
      assignee: { agent_id: 'codex', platform: 'codex' },
      connector: { connector_id: 'codex:codex', platform: 'codex', protocol: 'a2a' },
      payload: [{ kind: 'text', text: 'policy approval task' }],
    });
    expect(createdTask.ok).toBe(true);
    if (!createdTask.ok) {
      throw new Error(createdTask.error.message);
    }

    const approvalCreate = await fetch(`${baseUrl}/api/a2a/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task_id: createdTask.data.id,
        action: 'file_system_write',
        resource: '/workspace/src/index.ts',
        reason: 'Human approved the write',
        workspace_id: 'ws-policy-approval-context',
        trace_id: 'trace-policy-approval-context',
        granted_by: 'human-reviewer',
      }),
    });
    expect(approvalCreate.status).toBe(201);
    const createBody = await approvalCreate.json();
    const approvalId = createBody.data.approval.id as string;

    const context = await fetch(`${baseUrl}/api/a2a/tasks/${createdTask.data.id}/context`);
    expect(context.status).toBe(200);
    const contextBody = await context.json();
    expect(contextBody.success).toBe(true);
    expect(contextBody.data.task.metadata.approval).toMatchObject({
      approvalId,
      status: 'active',
      action: 'file_system_write',
      source: 'policy',
    });
    expect(contextBody.data.links.approval).toMatchObject({
      approvalId,
      status: 'active',
      action: 'file_system_write',
      grantedBy: 'human-reviewer',
      source: 'policy',
    });

    await waitFor(async () => {
      const history = await fetch(
        `${baseUrl}/api/a2a/orchestrate/thread-policy-approval-context/trace-policy-approval-context/history`,
        {
          headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
        },
      );
      if (history.status !== 200) return false;
      const historyBody = await history.json();
      return historyBody.lifecycle.some((entry: any) => entry.eventType === 'policy.approval.created');
    });

    const revoke = await fetch(`${baseUrl}/api/a2a/approvals/${createdTask.data.id}/revoke`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        approval_id: approvalId,
        revoked_by: 'human-reviewer',
      }),
    });
    expect(revoke.status).toBe(200);

    const revokedContext = await fetch(`${baseUrl}/api/a2a/tasks/${createdTask.data.id}/context`);
    expect(revokedContext.status).toBe(200);
    const revokedBody = await revokedContext.json();
    expect(revokedBody.data.task.metadata.approval).toMatchObject({
      approvalId,
      status: 'revoked',
      revokedBy: 'human-reviewer',
      source: 'policy',
    });
    expect(revokedBody.data.links.approval).toMatchObject({
      approvalId,
      status: 'revoked',
      resolvedBy: 'human-reviewer',
      source: 'policy',
    });

    const history = await fetch(
      `${baseUrl}/api/a2a/orchestrate/thread-policy-approval-context/trace-policy-approval-context/history`,
      {
        headers: { 'x-recoder-a2a-admin-token': 'admin-token' },
      },
    );
    expect(history.status).toBe(200);
    const historyBody = await history.json();
    expect(historyBody.lifecycle.some((entry: any) => entry.eventType === 'policy.approval.created')).toBe(true);
    expect(historyBody.lifecycle.some((entry: any) => entry.eventType === 'policy.approval.revoked')).toBe(true);
  });
});
