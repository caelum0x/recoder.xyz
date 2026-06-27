/**
 * permission-filter — git-write / network / shell gating.
 *
 * MERGED from the permission checks in `candidate()` of
 * `packages/agent-os/src/services/task-routing-service.ts`
 * (`allowGitWrite`/`allowNetwork`/`allowShell`). Pure: returns the reasons an
 * agent's permissions disqualify it for a task, in the source's order.
 *
 * An empty array means the agent's permissions permit the task; any reason
 * makes the candidate ineligible.
 */

import type { DirectoryAgentPermissions } from '../ports';
import { taskExpectsWrite, type RoutableTask } from './routing-request';

export function permissionReasons(
  task: RoutableTask,
  permissions: DirectoryAgentPermissions,
): string[] {
  const reasons: string[] = [];

  if (taskExpectsWrite(task) && !permissions.allowGitWrite) {
    reasons.push('git write is not allowed by agent policy');
  }
  if (task.metadata?.requiresNetwork === true && !permissions.allowNetwork) {
    reasons.push('network is not allowed by agent policy');
  }
  if (task.metadata?.requiresShell === true && !permissions.allowShell) {
    reasons.push('shell is not allowed by agent policy');
  }

  return reasons;
}
