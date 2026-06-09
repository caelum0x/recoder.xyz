import type { Approval, TaskSpec } from '@recoder/agent-os';

export function estimateApprovalGates(task: TaskSpec, now = new Date().toISOString()): Approval[] {
  const explicit = task.approvalRequired.map((reason, index): Approval => ({
    approvalId: `${task.taskId}-approval-${index + 1}`,
    taskId: task.taskId,
    status: 'pending',
    reason,
    requestedBy: 'pal',
    requestedAt: now,
    requiredAt: 'before_sensitive_action',
  }));

  const sensitivePaths = task.targetPaths.filter((path) => /auth|billing|security|secrets?|infra/.test(path));
  const inferred = sensitivePaths.map((path, index): Approval => ({
    approvalId: `${task.taskId}-risk-approval-${index + 1}`,
    taskId: task.taskId,
    status: 'pending',
    reason: `Sensitive path requires approval: ${path}`,
    requestedBy: 'pal',
    requestedAt: now,
    requiredAt: 'before_write',
    target: { path },
  }));

  return [...explicit, ...inferred];
}
