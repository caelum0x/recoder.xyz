import type { TaskSpec } from '@recoder/agent-os';
import { classifyTaskIntent } from './task-intent-classifier';
import type { AgentTeamPlan } from './agent-team';

export function selectRuntimeTeam(task: TaskSpec): AgentTeamPlan {
  const intent = classifyTaskIntent(task);

  if (intent === 'code_review' || intent === 'test_generation' || intent === 'verification') {
    return {
      primaryRuntime: 'codex',
      reviewerRuntime: 'claude_code',
      verifierRuntime: 'browser_agent',
    };
  }

  if (intent === 'research' || intent === 'documentation') {
    return {
      primaryRuntime: 'codex',
      reviewerRuntime: 'recoder_code',
    };
  }

  return {
    primaryRuntime: 'claude_code',
    reviewerRuntime: 'codex',
    verifierRuntime: task.verification.browserChecks?.length ? 'browser_agent' : undefined,
  };
}
