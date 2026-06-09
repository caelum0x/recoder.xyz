import type { TaskSpec } from '@recoder/agent-os';

export function selectSkills(task: TaskSpec): string[] {
  const skills = ['recoder-platform'];

  if (task.intent === 'code_review') {
    skills.push('code-review');
  }
  if (task.intent === 'bugfix' || task.intent === 'verification') {
    skills.push('verification-playbook');
  }
  if (task.targetPaths.some((path) => /app|components|frontend|web/.test(path))) {
    skills.push('frontend-design');
  }
  if (task.forbiddenPaths.length > 0 || task.approvalRequired.length > 0) {
    skills.push('security-review');
  }

  return [...new Set(skills)];
}
