import { beforeEach, describe, expect, it } from 'vitest';
import { AutonomousRoutingService, resetAutonomousRoutingService } from '../autonomous-routing.service';
import { getApprovalGateService, resetApprovalGateService } from '../approval-gate.service';
import { getCollaborationSvc, initCollaborationSvc, resetCollaborationSvc } from '../collaboration.service';
import { getWorkspaceService, resetWorkspaceService } from '../workspace.service';
import { getTaskLifecycleService, resetTaskLifecycleService } from '../task-lifecycle.service';
import { resetDelegationChainService, getDelegationChainService } from '../delegation-chain.service';
import { InMemoryCollaborationService } from '@recoder/shared/a2a';

describe('AutonomousRoutingService approval integration', () => {
  let router: AutonomousRoutingService;
  let taskLifecycle: ReturnType<typeof getTaskLifecycleService>;

  beforeEach(() => {
    resetAutonomousRoutingService();
    resetApprovalGateService();
    resetDelegationChainService();
    resetWorkspaceService();
    resetCollaborationSvc();
    resetTaskLifecycleService();

    initCollaborationSvc(new InMemoryCollaborationService());
    router = new AutonomousRoutingService();
    taskLifecycle = getTaskLifecycleService();
  });

  it('moves the source task into input-required while approval is pending and resumes it on grant', async () => {
    const collab = getCollaborationSvc();
    const workspace = getWorkspaceService().create({
      name: 'Approval Workspace',
      projectId: 'proj-1',
      ownerId: 'owner-1',
      memberAgentIds: ['agent-a', 'agent-b'],
      settings: { approvalRequired: true },
    });
    const thread = collab.createThread(workspace.defaultChannelId, 'Delegation thread');

    const created = taskLifecycle.createTask({
      workspace_id: workspace.workspaceId,
      thread_id: thread.id,
      requester: { agent_id: 'pm', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-a', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Handle the current task' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    taskLifecycle.startTask(created.data.id, 'agent-a');

    await router.processHandoff({
      channelId: workspace.defaultChannelId,
      message: collab.sendMessage({
        threadId: thread.id,
        senderAgentId: 'agent-a',
        text: '@agent-b delegate: review the current task',
      }),
      mentionedAgentIds: ['agent-b'],
    });

    const pendingTask = taskLifecycle.getTask(created.data.id);
    expect(pendingTask.ok).toBe(true);
    if (!pendingTask.ok) return;
    expect(pendingTask.data.state).toBe('input-required');
    expect(pendingTask.data.metadata?.approval).toMatchObject({
      status: 'pending',
      targetAgentId: 'agent-b',
    });

    const [approval] = getApprovalGateService().listPending(workspace.workspaceId);
    expect(approval).toBeDefined();

    getApprovalGateService().grant(approval.approvalId, 'human-reviewer');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resumedTask = taskLifecycle.getTask(created.data.id);
    expect(resumedTask.ok).toBe(true);
    if (!resumedTask.ok) return;
    expect(resumedTask.data.state).toBe('working');
    expect(resumedTask.data.metadata?.approval).toMatchObject({
      status: 'granted',
      resolvedBy: 'human-reviewer',
    });
    expect(resumedTask.data.metadata?.handoff).toMatchObject({
      status: 'delegated',
      targetAgentId: 'agent-b',
    });

    const delegations = getDelegationChainService().getDelegationsFrom('agent-a');
    expect(delegations).toHaveLength(1);
    expect(delegations[0].metadata).toMatchObject({
      sourceTaskId: created.data.id,
      approvalId: approval.approvalId,
    });
  });
});
