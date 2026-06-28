/**
 * Conductor delivery approval gate tests.
 *
 * Proves the production rule wiring: a PR/merge is permitted only when a matching
 * approved control-plane Approval exists for the workspace's task; otherwise the
 * action is blocked and the workspace is moved to awaiting_approval.
 *
 * Drives the REAL gate over the REAL in-memory AgentOsRepository singleton
 * (default when no AGENT_OS_DATABASE_URL is set). Skips on a Postgres driver
 * rather than mutate a real database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Approval, Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import {
  checkDeliveryApproval,
  enforceDeliveryApproval,
  DeliveryApprovalRequiredError,
} from './delivery-approval.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

describe.skipIf(!usingMemoryRepo)('conductor delivery approval gate', () => {
  const repo = agentOsContainer.repository;

  function seedWorkspace(state: Workspace['state'], taskId: string): Promise<Workspace> {
    const now = new Date().toISOString();
    const ws: Workspace = {
      workspaceId: `ws_${randomUUID()}`,
      spaceId: 'space_gate_test',
      projectId: 'proj_gate_test',
      taskId,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'recoder/gate-test',
      baseRef: 'HEAD',
      worktreePath: '/tmp/gate-test',
      state,
      createdBy: 'gate-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    return repo.upsertWorkspace(ws);
  }

  function seedApproval(
    taskId: string,
    status: Approval['status'],
    requiredAt: Approval['requiredAt'],
  ): Promise<Approval> {
    const approval: Approval = {
      approvalId: `approval_${randomUUID()}`,
      taskId,
      status,
      reason: 'gate test',
      requestedBy: 'gate-test',
      requestedAt: new Date().toISOString(),
      requiredAt,
    };
    return repo.upsertApproval(approval);
  }

  let taskId: string;
  beforeEach(() => {
    taskId = `task_gate_${randomUUID()}`;
  });

  it('checkDeliveryApproval: not approved when no approval exists', async () => {
    const check = await checkDeliveryApproval(taskId, 'merge');
    expect(check.approved).toBe(false);
    expect(check.reason).toContain('no approved');
  });

  it('checkDeliveryApproval: approved with an approved before_pr approval', async () => {
    await seedApproval(taskId, 'approved', 'before_pr');
    const pr = await checkDeliveryApproval(taskId, 'pr');
    expect(pr.approved).toBe(true);
    const merge = await checkDeliveryApproval(taskId, 'merge');
    expect(merge.approved).toBe(true);
  });

  it('checkDeliveryApproval: an after_verification approval authorizes merge but not pr', async () => {
    await seedApproval(taskId, 'approved', 'after_verification');
    expect((await checkDeliveryApproval(taskId, 'merge')).approved).toBe(true);
    expect((await checkDeliveryApproval(taskId, 'pr')).approved).toBe(false);
  });

  it('checkDeliveryApproval: a rejected approval does not authorize delivery', async () => {
    await seedApproval(taskId, 'rejected', 'before_pr');
    const check = await checkDeliveryApproval(taskId, 'pr');
    expect(check.approved).toBe(false);
    expect(check.reason).toContain('rejected');
  });

  it('enforceDeliveryApproval: passes silently when approved', async () => {
    const ws = await seedWorkspace('running', taskId);
    await seedApproval(taskId, 'approved', 'before_pr');
    await expect(enforceDeliveryApproval(ws, 'pr')).resolves.toBeUndefined();
    // State unchanged (no gate transition).
    const after = await repo.getWorkspace(ws.workspaceId);
    expect(after?.state).toBe('running');
  });

  it('enforceDeliveryApproval: blocks a PR from running and transitions to awaiting_approval', async () => {
    const ws = await seedWorkspace('running', taskId);
    await expect(enforceDeliveryApproval(ws, 'pr')).rejects.toBeInstanceOf(DeliveryApprovalRequiredError);

    const after = await repo.getWorkspace(ws.workspaceId);
    expect(after?.state).toBe('awaiting_approval');
    const gate = after?.metadata?.deliveryGate as Record<string, unknown> | undefined;
    expect(gate?.action).toBe('pr');
  });

  it('enforceDeliveryApproval: blocks a merge from awaiting_review (records gate, stays in state)', async () => {
    const ws = await seedWorkspace('awaiting_review', taskId);
    let thrown: unknown;
    try {
      await enforceDeliveryApproval(ws, 'merge');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DeliveryApprovalRequiredError);
    const error = thrown as DeliveryApprovalRequiredError;
    expect(error.state).toBe('awaiting_approval');
    // awaiting_review -> awaiting_approval is not a legal transition, so the
    // record stays in awaiting_review but the gate is recorded truthfully.
    expect(error.transitioned).toBe(false);
    const after = await repo.getWorkspace(ws.workspaceId);
    expect(after?.state).toBe('awaiting_review');
    const gate = after?.metadata?.deliveryGate as Record<string, unknown> | undefined;
    expect(gate?.blocked).toBe(true);
  });

  it('enforceDeliveryApproval: honors an explicit safe-automation bypass', async () => {
    const ws = await seedWorkspace('running', taskId);
    const bypassed = await repo.upsertWorkspace({
      ...ws,
      metadata: { ...ws.metadata, deliveryApprovalBypass: true },
    });
    await expect(enforceDeliveryApproval(bypassed, 'merge')).resolves.toBeUndefined();
  });
});
