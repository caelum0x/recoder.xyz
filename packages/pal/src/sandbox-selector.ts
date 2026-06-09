import type { TaskSpec } from '@recoder/agent-os';
import { estimateTaskRisk } from './risk-model';

export type SandboxChoice = 'daytona' | 'e2b' | 'local_container' | 'none';

export function selectSandbox(task: TaskSpec): SandboxChoice {
  const risk = estimateTaskRisk(task);
  if (risk === 'high') return 'daytona';
  if (task.intent === 'research') return 'none';
  return 'local_container';
}

