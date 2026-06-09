export type TaskIntent =
  | 'bugfix'
  | 'feature_delivery'
  | 'platform_hardening'
  | 'refactor'
  | 'code_review'
  | 'test_generation'
  | 'verification'
  | 'documentation'
  | 'research'
  | 'release'
  | 'incident_response'
  | 'migration'
  | 'handoff'
  | 'custom';

export type VerificationPlan = {
  commands: string[];
  browserChecks?: string[];
  evidenceRequired?: string[];
};

export type TaskSpec = {
  taskId: string;
  title: string;
  intent: TaskIntent;
  goal: string;
  spaceId: string;
  repo?: string;
  branchPolicy?: 'reuse_branch' | 'create_worktree_branch' | 'no_git_write' | 'custom';
  targetPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verification: VerificationPlan;
  approvalRequired: string[];
  artifactRequired: string[];
  handoff?: {
    reviewer?: string;
    finalOwner?: string;
  };
  metadata?: Record<string, unknown>;
};

export type TaskRunState =
  | 'created'
  | 'compiled'
  | 'routed'
  | 'claimed'
  | 'running'
  | 'needs_input'
  | 'verifying'
  | 'waiting_for_approval'
  | 'approved'
  | 'delivered'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export const TERMINAL_TASK_RUN_STATES: readonly TaskRunState[] = [
  'completed',
  'failed',
  'cancelled',
  'rejected',
] as const;

export type TaskRun = {
  runId: string;
  taskId: string;
  spaceId: string;
  state: TaskRunState;
  assigneeAgentId?: string;
  instructionBundleId?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
};

const ALLOWED_TRANSITIONS: Record<TaskRunState, readonly TaskRunState[]> = {
  created: ['compiled', 'cancelled', 'failed'],
  compiled: ['routed', 'cancelled', 'failed'],
  routed: ['claimed', 'cancelled', 'failed'],
  claimed: ['running', 'needs_input', 'cancelled', 'failed'],
  running: ['needs_input', 'verifying', 'waiting_for_approval', 'delivered', 'completed', 'cancelled', 'failed'],
  needs_input: ['running', 'waiting_for_approval', 'cancelled', 'failed'],
  verifying: ['waiting_for_approval', 'delivered', 'completed', 'failed'],
  waiting_for_approval: ['approved', 'rejected', 'cancelled', 'failed'],
  approved: ['running', 'delivered', 'completed', 'failed'],
  delivered: ['completed', 'waiting_for_approval', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
  rejected: [],
};

export function isTerminalTaskRunState(state: TaskRunState): boolean {
  return TERMINAL_TASK_RUN_STATES.includes(state);
}

export function isAllowedTaskRunTransition(from: TaskRunState, to: TaskRunState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionTaskRun(
  run: TaskRun,
  to: TaskRunState,
  options: { now?: string; metadata?: Record<string, unknown> } = {},
): TaskRun {
  if (!isAllowedTaskRunTransition(run.state, to)) {
    throw new Error(`Invalid task run transition: ${run.state} -> ${to}`);
  }

  const now = options.now ?? new Date().toISOString();
  return {
    ...run,
    state: to,
    updatedAt: now,
    completedAt: isTerminalTaskRunState(to) ? now : run.completedAt,
    metadata: {
      ...(run.metadata ?? {}),
      ...(options.metadata ?? {}),
    },
  };
}
