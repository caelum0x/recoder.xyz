import type { TaskIntent, TaskSpec } from '@recoder/agent-os';

export function classifyTaskIntent(task: Pick<TaskSpec, 'intent' | 'title' | 'goal'>): TaskIntent {
  if (task.intent !== 'custom') {
    return task.intent;
  }

  const text = `${task.title} ${task.goal}`.toLowerCase();
  if (/review|audit/.test(text)) return 'code_review';
  if (/test|spec|coverage/.test(text)) return 'test_generation';
  if (/deploy|release|preview/.test(text)) return 'release';
  if (/bug|crash|fix|regression/.test(text)) return 'bugfix';
  if (/doc|readme|guide/.test(text)) return 'documentation';
  return 'platform_hardening';
}
