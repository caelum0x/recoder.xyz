import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { workspaceRouter } from './workspace.routes';
import { workflowMessagingRouter } from './workflow-messaging.routes';
import { getWorkspaceService, resetWorkspaceService } from './workspace.service';
import { getApprovalGateService, resetApprovalGateService } from './approval-gate.service';
import { getDelegationChainService, resetDelegationChainService } from './delegation-chain.service';
import { getAgentRegistryService, resetAgentRegistryService } from './agent-registry.service';
import { resetCollaborationSvc } from './collaboration.service';
import { getTaskLifecycleService, resetTaskLifecycleService } from './task-lifecycle.service';

describe('A2A workspace routes', () => {
  const realFetch = globalThis.fetch;
  let server: any;
  let baseUrl = '';

  beforeEach(async () => {
    globalThis.fetch = realFetch;
    resetWorkspaceService();
    resetApprovalGateService();
    resetDelegationChainService();
    resetAgentRegistryService();
    resetCollaborationSvc();
    resetTaskLifecycleService();

    const app = express();
    app.use('/api/a2a', express.text({ type: 'application/json' }));
    app.use('/api/a2a/workspaces', workspaceRouter);
    app.use('/api/a2a', workflowMessagingRouter);

    server = await new Promise<any>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    resetApprovalGateService();
    resetDelegationChainService();
    resetAgentRegistryService();
    resetWorkspaceService();
    resetCollaborationSvc();
    resetTaskLifecycleService();
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  function createWorkspace(memberAgentIds: string[], projectId = 'proj-workspace-routes') {
    return getWorkspaceService().create({
      name: `ws-${projectId}`,
      projectId,
      ownerId: 'owner-test',
      memberAgentIds,
      settings: { approvalRequired: true },
    });
  }

  it('lists workspace agents with registry-backed visibility', async () => {
    const workspace = createWorkspace(['agent-registry'], 'proj-agents');
    getAgentRegistryService().selfRegister({
      agentId: 'agent-registry',
      name: 'Registry Agent',
      platform: 'codex',
      tags: ['code'],
      skills: [{ id: 'execute', name: 'execute', description: 'execute', tags: ['execute'] }],
    });

    const response = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/agents`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.agents).toHaveLength(1);
    expect(body.data.agents[0]).toMatchObject({
      agentId: 'agent-registry',
      name: 'Registry Agent',
      platform: 'codex',
      status: 'online',
      isLocal: false,
    });
    expect(body.data.agents[0].registry).toMatchObject({
      online: true,
      registrationCount: 1,
    });
  });

  it('lists workspace pending approvals', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-approvals');
    const approval = getApprovalGateService().createRequest({
      workspaceId: workspace.workspaceId,
      requestingAgentId: 'agent-a',
      targetAgentId: 'agent-b',
      action: 'delegate',
      details: { prompt: 'review current task' },
    });

    const response = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/approvals?status=pending`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.approvals[0].approvalId).toBe(approval.approvalId);
  });

  it('lists workspace tasks for the mission-control task pipeline', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-tasks');
    const created = getTaskLifecycleService().createTask({
      workspace_id: workspace.workspaceId,
      thread_id: 'thread-task-pipeline',
      requester: { agent_id: 'agent-a', platform: 'codex' },
      assignee: { agent_id: 'agent-b', platform: 'claude_code' },
      connector: { connector_id: 'claude-1', platform: 'claude_code', protocol: 'mcp' },
      payload: { kind: 'text', text: 'Write tests for the latest patch' },
    });
    expect(created.ok).toBe(true);

    const response = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/tasks`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.tasks[0]).toMatchObject({
      prompt: 'Write tests for the latest patch',
      state: 'submitted',
      assignee_agent_id: 'agent-b',
      workspace_id: workspace.workspaceId,
    });
  });

  it('builds a unified workspace control-plane snapshot with evidence totals', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-control-plane');
    getAgentRegistryService().selfRegister({
      agentId: 'agent-b',
      name: 'Assignee Agent',
      platform: 'codex',
      tags: ['code'],
      skills: [{ id: 'execute', name: 'execute', description: 'execute', tags: ['execute'] }],
    });

    getApprovalGateService().createRequest({
      workspaceId: workspace.workspaceId,
      requestingAgentId: 'agent-a',
      targetAgentId: 'agent-b',
      action: 'delegate',
      details: { prompt: 'review current task' },
    });

    getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'Review the patch set',
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        channelId: workspace.defaultChannelId,
        sourceTaskId: 'task-snapshot',
        intent: 'review',
      },
    });

    const created = getTaskLifecycleService().createTask({
      workspace_id: workspace.workspaceId,
      thread_id: 'thread-control-plane',
      requester: { agent_id: 'agent-a', platform: 'codex' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Capture evidence and finish the task' },
      metadata: { previewUrl: 'https://preview.recoder.xyz/control-plane' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    getTaskLifecycleService().startTask(created.data.id, 'codex-1');
    const completed = getTaskLifecycleService().completeTask(
      created.data.id,
      {
        text: 'Done',
        data: {
          filesChanged: ['src/app.tsx'],
          stdout: 'server started',
          stderr: 'warning: cache warmup',
          gitStatus: 'M src/app.tsx',
          gitBranch: 'feature/control-plane',
        },
      },
      'codex-1',
    );
    expect(completed.ok).toBe(true);

    const response = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/control-plane`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.summary).toMatchObject({
      totalAgents: 2,
      totalTasks: 1,
      pendingApprovals: 1,
      activeHandoffs: 1,
      evidenceItems: 6,
      logEvidence: 2,
      runtimeEvidence: 1,
      previews: 1,
    });
    expect(body.data.tasks[0].runtime).toMatchObject({
      evidenceCount: 6,
      logCount: 2,
      runtimeCount: 1,
    });
  });

  it('builds a structured Recoder Space context package', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-context');
    getAgentRegistryService().selfRegister({
      agentId: 'agent-b',
      name: 'Context Agent',
      platform: 'codex',
      tags: ['code'],
      skills: [{ id: 'execute', name: 'execute', description: 'execute', tags: ['execute'] }],
    });

    getApprovalGateService().createRequest({
      workspaceId: workspace.workspaceId,
      requestingAgentId: 'agent-a',
      targetAgentId: 'agent-b',
      action: 'delegate',
      details: { prompt: 'Need review before merge' },
    });

    getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'Review the pricing work',
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        channelId: workspace.defaultChannelId,
        sourceTaskId: 'task-context',
        intent: 'review',
      },
    });

    const created = getTaskLifecycleService().createTask({
      workspace_id: workspace.workspaceId,
      thread_id: 'thread-context',
      requester: { agent_id: 'agent-a', platform: 'codex' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-ctx', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Add pricing page' },
      metadata: {
        previewUrl: 'https://preview.recoder.xyz/context',
        worktree: {
          isolated: true,
          branchName: 'recoder/add-pricing-page-123',
          baseBranch: 'main',
          worktreePath: '/tmp/recoder-space-123',
          reviewReady: true,
          changedFiles: ['app/pricing/page.tsx'],
        },
        handoff: {
          status: 'review-ready',
          intent: 'review',
          reviewTarget: 'recoder/add-pricing-page-123',
          reviewPath: '/tmp/recoder-space-123',
          assignedBy: 'agent-b',
        },
        merge: {
          status: 'pending-review',
          branchName: 'recoder/add-pricing-page-123',
          baseBranch: 'main',
          suggestedAction: 'review-worktree-branch',
          changedFiles: ['app/pricing/page.tsx'],
        },
      },
    });
    expect(created.ok).toBe(true);

    const response = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/context`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.contextVersion).toBe('2026-05-12');
    expect(body.data.workspace).toMatchObject({
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      projectId: workspace.projectId,
    });
    expect(body.data.summary).toMatchObject({
      totalAgents: 2,
      totalTasks: 1,
      pendingApprovals: 1,
      activeHandoffs: 1,
    });
    expect(body.data.agents).toHaveLength(2);
    expect(body.data.recentTasks[0]).toMatchObject({
      prompt: 'Add pricing page',
      workspace_id: workspace.workspaceId,
      review: {
        worktree: {
          isolated: true,
          branchName: 'recoder/add-pricing-page-123',
        },
        merge: {
          status: 'pending-review',
          suggestedAction: 'review-worktree-branch',
        },
      },
    });
    expect(body.data.pendingApprovals).toHaveLength(1);
    expect(body.data.activeHandoffs).toHaveLength(1);
  });

  it('creates and lists workspace handoffs with active filtering', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-handoffs');

    const create = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/handoffs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        taskId: 'task-123',
        intent: 'delegate',
        context: { prompt: 'Review the patch set' },
      }),
    });
    expect(create.status).toBe(201);
    const createdBody = await create.json();
    expect(createdBody.success).toBe(true);
    expect(createdBody.data).toMatchObject({
      workspaceId: workspace.workspaceId,
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      taskId: 'task-123',
      intent: 'delegate',
      status: 'active',
    });

    const list = await fetch(`${baseUrl}/api/a2a/workspaces/${workspace.workspaceId}/handoffs?status=active`);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.handoffs[0].handoffId).toBe(createdBody.data.handoffId);
  });

  it('accepts and declines handoffs through top-level alias routes', async () => {
    const workspace = createWorkspace(['agent-a', 'agent-b'], 'proj-handoff-alias');

    const first = getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'First delegation',
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        channelId: workspace.defaultChannelId,
        sourceTaskId: 'task-accept',
        intent: 'handoff',
      },
    });

    const accept = await fetch(`${baseUrl}/api/a2a/handoffs/${first.delegationId}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(accept.status).toBe(200);
    const acceptBody = await accept.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.data.status).toBe('accepted');

    const second = getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'Second delegation',
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        channelId: workspace.defaultChannelId,
        sourceTaskId: 'task-decline',
        intent: 'review',
      },
    });

    const decline = await fetch(`${baseUrl}/api/a2a/handoffs/${second.delegationId}/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'busy' }),
    });
    expect(decline.status).toBe(200);
    const declineBody = await decline.json();
    expect(declineBody.success).toBe(true);
    expect(declineBody.data.status).toBe('rejected');
  });
});
