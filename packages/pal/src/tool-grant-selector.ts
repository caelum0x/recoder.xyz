import type { TaskSpec } from '@recoder/agent-os';

const BASE_TOOLS = [
  'recoder.tasks',
  'recoder.artifacts',
  'recoder.approvals',
  'recoder.memory',
  'recoder.git_nexus',
  'recoder.beads',
] as const;

export function selectToolGrants(task: TaskSpec): string[] {
  const tools: string[] = [...BASE_TOOLS];

  if (task.verification.browserChecks?.length) {
    tools.push('recoder.browser');
    tools.push('recoder.preview');
  }

  if (task.repo) {
    tools.push('recoder.repo');
    tools.push('recoder.github');
  }

  if (task.intent === 'release') {
    tools.push('recoder.deploy');
  }

  return [...new Set(tools)];
}
