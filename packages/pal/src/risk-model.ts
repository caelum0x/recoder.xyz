import type { TaskSpec } from '@recoder/agent-os';

export type RiskLevel = 'low' | 'medium' | 'high';

export function estimateTaskRisk(task: TaskSpec): RiskLevel {
  if (task.targetPaths.some((path) => /auth|billing|security|secrets?|infra|migrations?/.test(path))) {
    return 'high';
  }
  if (task.targetPaths.some((path) => /api|backend|server|runtime|workflow|policy/.test(path))) {
    return 'medium';
  }
  return 'low';
}

