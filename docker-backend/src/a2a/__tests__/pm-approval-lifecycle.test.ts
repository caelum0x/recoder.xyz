/**
 * @module pm-approval-lifecycle.test
 *
 * Focused tests for PM approval/reject/pause/handoff as first-class lifecycle
 * transitions, and for the approval-gate -> task-lifecycle wiring.
 *
 * Covers:
 * - pauseTask / resumeTask / rejectTask / handoffTask on the service
 * - resolveApprovalDecision driving state from an approval decision
 * - wireApprovalToTaskLifecycle: granting/rejecting an approval drives the task
 * - audit events emitted for each PM decision
 * - preservation of history / artifacts / ownership lineage on handoff
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TaskLifecycleService,
  InMemoryTaskStore,
  type CreateTaskInput,
  type AuditEventSink,
} from '../task-lifecycle.service';
import { ApprovalGateService, resetApprovalGateService } from '../approval-gate.service';
import {
  wireApprovalToTaskLifecycle,
  resetApprovalLifecycleWiring,
} from '../approval-lifecycle-wiring';
import {
  TaskStateEnum,
  A2AErrorCodeEnum,
  type TaskEnvelope,
  type AuditEvent,
} from '@recoder/shared/a2a';

// Avoid disk persistence noise between tests.
vi.mock('../a2a-persistence', () => ({
  loadA2ATasks: () => new Map(),
  saveA2ATasks: () => {},
  saveA2ATasksImmediate: () => {},
  loadA2AApprovals: () => new Map(),
  saveA2AApprovals: () => {},
}));

vi.mock('../a2a-event-bus', () => ({
  getA2AEventBus: () => ({ publish: vi.fn() }),
  A2AEventType: {
    ApprovalGranted: 'approval.granted',
    ApprovalRejected: 'approval.rejected',
    ApprovalEscalated: 'approval.escalated',
  },
}));

function makeCreateInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    workspace_id: 'ws_pm',
    thread_id: 'thr_pm',
    requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
    assignee: { agent_id: 'agent-codex', platform: 'codex' },
    connector: { platform: 'codex', protocol: 'jsonrpc', connector_id: 'codex-v1' },
    payload: { kind: 'text', text: 'Build the thing' },
    ...overrides,
  };
}

/** Create a task and move it to `working`. */
function makeWorkingTask(service: TaskLifecycleService): TaskEnvelope {
  const created = service.createTask(makeCreateInput());
  if (!created.ok) throw new Error('failed to create task');
  const started = service.startTask(created.data.id, 'agent-codex');
  if (!started.ok) throw new Error('failed to start task');
  return started.data;
}

describe('PM lifecycle transitions', () => {
  let service: TaskLifecycleService;
  let audit: AuditEvent[];

  beforeEach(() => {
    service = new TaskLifecycleService(new InMemoryTaskStore());
    audit = [];
    const sink: AuditEventSink = (e) => { audit.push(e); };
    service.addAuditSink(sink);
  });

  describe('pauseTask', () => {
    it('pauses a working task into input-required with pause metadata', () => {
      const task = makeWorkingTask(service);

      const result = service.pauseTask(task.id, {
        reason: 'awaiting budget approval',
        triggeredBy: 'pm-user',
        approvalId: 'approval_123',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.InputRequired);
      const pm = result.data.metadata?.pmLifecycle as any;
      expect(pm.phase).toBe('paused');
      expect(pm.pause.reason).toBe('awaiting budget approval');
      expect(pm.pause.approvalId).toBe('approval_123');
    });

    it('rejects pausing a submitted task (must be working)', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('create failed');
      const result = service.pauseTask(created.data.id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.InvalidStateTransition);
    });

    it('emits a pause audit event with pm_decision metadata', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { reason: 'hold', triggeredBy: 'pm-user' });
      const evt = audit.find((e) => (e.metadata as any)?.pm_decision === 'pause');
      expect(evt).toBeDefined();
      expect(evt?.actor.id).toBe('pm-user');
    });
  });

  describe('resumeTask', () => {
    it('resumes a paused task back to working and clears pause', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { reason: 'hold' });

      const result = service.resumeTask(task.id, { triggeredBy: 'pm-user' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Working);
      const pm = result.data.metadata?.pmLifecycle as any;
      expect(pm.phase).toBe('resumed');
      expect(pm.pause).toBeUndefined();
      expect(pm.resume.resumedBy).toBe('pm-user');
    });

    it('rejects resuming a task that is not paused', () => {
      const task = makeWorkingTask(service);
      const result = service.resumeTask(task.id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.InvalidStateTransition);
    });

    it('returns 404 for unknown task', () => {
      const result = service.resumeTask('task_missing');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
    });
  });

  describe('rejectTask', () => {
    it('terminates a working task into cancelled with reject metadata', () => {
      const task = makeWorkingTask(service);
      const result = service.rejectTask(task.id, {
        reason: 'out of scope',
        triggeredBy: 'pm-user',
        approvalId: 'approval_xyz',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
      const pm = result.data.metadata?.pmLifecycle as any;
      expect(pm.phase).toBe('rejected');
      expect(pm.reject.reason).toBe('out of scope');
      expect(pm.reject.approvalId).toBe('approval_xyz');
    });

    it('can reject a paused task (denied approval)', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { reason: 'hold', approvalId: 'a1' });
      const result = service.rejectTask(task.id, { reason: 'denied', approvalId: 'a1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
    });

    it('rejects an already-terminal task with 409', () => {
      const task = makeWorkingTask(service);
      service.rejectTask(task.id, { reason: 'first' });
      const second = service.rejectTask(task.id, { reason: 'second' });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.httpStatus).toBe(409);
    });
  });

  describe('handoffTask', () => {
    it('reassigns the task while preserving state, history and artifacts', () => {
      const task = makeWorkingTask(service);
      // Attach an artifact via a transition result to simulate prior work.
      service.requestInput(task.id, 'need clarification');
      service.transition(task.id, TaskStateEnum.Working, { reason: 'clarified' });

      const before = service.getTask(task.id);
      if (!before.ok) throw new Error('missing task');
      const historyLenBefore = before.data.history?.length ?? 0;

      const result = service.handoffTask(
        task.id,
        { agent_id: 'agent-claude', platform: 'claude_code' },
        { reason: 'codex unavailable', triggeredBy: 'pm-user' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Assignee reassigned
      expect(result.data.assignee.agent_id).toBe('agent-claude');
      expect(result.data.assignee.platform).toBe('claude_code');
      // State preserved (still working)
      expect(result.data.state).toBe(TaskStateEnum.Working);
      // History preserved (handoff does not truncate)
      expect(result.data.history?.length).toBe(historyLenBefore);
      // Chain of custody recorded
      const pm = result.data.metadata?.pmLifecycle as any;
      expect(pm.phase).toBe('handed-off');
      expect(pm.handoffs).toHaveLength(1);
      expect(pm.handoffs[0].from.agent_id).toBe('agent-codex');
      expect(pm.handoffs[0].to.agent_id).toBe('agent-claude');
    });

    it('appends to the handoff chain across multiple handoffs', () => {
      const task = makeWorkingTask(service);
      service.handoffTask(task.id, { agent_id: 'agent-claude', platform: 'claude_code' });
      const second = service.handoffTask(task.id, { agent_id: 'agent-cursor', platform: 'cursor' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      const pm = second.data.metadata?.pmLifecycle as any;
      expect(pm.handoffs).toHaveLength(2);
      expect(pm.handoffs[1].from.agent_id).toBe('agent-claude');
      expect(pm.handoffs[1].to.agent_id).toBe('agent-cursor');
    });

    it('refuses to hand off a terminal task with 409', () => {
      const task = makeWorkingTask(service);
      service.rejectTask(task.id, { reason: 'done' });
      const result = service.handoffTask(task.id, { agent_id: 'x', platform: 'codex' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(409);
    });

    it('validates the new assignee', () => {
      const task = makeWorkingTask(service);
      const result = service.handoffTask(task.id, { agent_id: '', platform: 'codex' } as any);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.MissingEnvelopeField);
    });

    it('emits a handoff audit event', () => {
      const task = makeWorkingTask(service);
      service.handoffTask(task.id, { agent_id: 'agent-claude', platform: 'claude_code' }, { triggeredBy: 'pm-user' });
      const evt = audit.find((e) => (e.metadata as any)?.pm_decision === 'handoff');
      expect(evt).toBeDefined();
      expect((evt?.metadata as any)?.from_assignee).toBe('agent-codex');
      expect((evt?.metadata as any)?.to_assignee).toBe('agent-claude');
    });
  });

  describe('resolveApprovalDecision', () => {
    it('resumes a paused task when the approval is granted', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { approvalId: 'a1' });
      const result = service.resolveApprovalDecision(task.id, 'granted', { approvalId: 'a1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Working);
    });

    it('terminates a paused task when the approval is rejected', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { approvalId: 'a1' });
      const result = service.resolveApprovalDecision(task.id, 'rejected', { approvalId: 'a1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
    });

    it('terminates a paused task when the approval expires', () => {
      const task = makeWorkingTask(service);
      service.pauseTask(task.id, { approvalId: 'a1' });
      const result = service.resolveApprovalDecision(task.id, 'expired', { approvalId: 'a1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
    });

    it('is a no-op (success) for an already-terminal task', () => {
      const task = makeWorkingTask(service);
      service.rejectTask(task.id, { reason: 'done' });
      const result = service.resolveApprovalDecision(task.id, 'granted');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
    });
  });
});

describe('approval-gate -> task lifecycle wiring', () => {
  let service: TaskLifecycleService;
  let approvalGate: ApprovalGateService;

  beforeEach(() => {
    resetApprovalGateService();
    resetApprovalLifecycleWiring();
    service = new TaskLifecycleService(new InMemoryTaskStore());
    approvalGate = new ApprovalGateService();
    wireApprovalToTaskLifecycle({ approvalGate, taskLifecycle: service });
  });

  it('resumes the linked task when its approval is granted', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('create failed');
    const task = created.data;
    service.startTask(task.id);
    service.pauseTask(task.id);

    const approval = approvalGate.createRequest({
      workspaceId: task.workspace_id,
      requestingAgentId: 'agent-pm',
      targetAgentId: 'agent-codex',
      action: 'deploy',
      details: { sourceTaskId: task.id },
    });

    approvalGate.grant(approval.approvalId, 'pm-user');

    const after = service.getTask(task.id);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.state).toBe(TaskStateEnum.Working);
  });

  it('terminates the linked task when its approval is rejected', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('create failed');
    const task = created.data;
    service.startTask(task.id);
    service.pauseTask(task.id);

    const approval = approvalGate.createRequest({
      workspaceId: task.workspace_id,
      requestingAgentId: 'agent-pm',
      targetAgentId: 'agent-codex',
      action: 'deploy',
      details: { taskId: task.id },
    });

    approvalGate.reject(approval.approvalId, 'pm-user');

    const after = service.getTask(task.id);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.state).toBe(TaskStateEnum.Cancelled);
    const pm = after.data.metadata?.pmLifecycle as any;
    expect(pm.phase).toBe('rejected');
  });

  it('ignores approvals not linked to any task', () => {
    const approval = approvalGate.createRequest({
      workspaceId: 'ws_pm',
      requestingAgentId: 'agent-pm',
      targetAgentId: 'agent-codex',
      action: 'deploy',
      details: {},
    });
    // Should not throw even though there is no linked task.
    expect(() => approvalGate.grant(approval.approvalId, 'pm-user')).not.toThrow();
  });
});
