/**
 * Conductor Workspace — an isolated unit of parallel agent work.
 *
 * A Workspace binds the control-plane (task/run) to the execution substrate: an
 * isolated git worktree + branch, a persistent terminal session (tmux), and an
 * assigned runtime (claude_code / codex / opencode / recoder_code / pi). It is
 * the control-plane state of record for one Conductor.build-style "workspace".
 *
 * Live execution (tmux session, worktree files) is owned by the orchestration
 * layer; this type is the durable record that lets the system reconcile and
 * resume after a backend restart. See docs/CONDUCTOR-ARCHITECTURE.md.
 */

export type WorkspaceState =
  | 'created'
  | 'setting_up'
  | 'ready'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_review'
  | 'changes_requested'
  | 'merging'
  | 'merged'
  | 'failed'
  | 'cancelled'
  | 'archived';

export const TERMINAL_WORKSPACE_STATES: readonly WorkspaceState[] = ['archived'] as const;

/**
 * Substrate the workspace's execution runs on.
 *
 * - `tmux_worktree` — local git worktree + persistent tmux session (default).
 * - `daytona`       — remote Daytona sandbox.
 * - `in_process`    — local git worktree, agent driven in-process by
 *                     `@recoder/runtime`'s in-process driver (no tmux, no child
 *                     CLI). Opt-in only; never the default. Selected solely when a
 *                     Workspace is explicitly created with `substrate: 'in_process'`.
 */
export type WorkspaceSubstrate = 'tmux_worktree' | 'daytona' | 'in_process';

export type Workspace = {
  workspaceId: string;
  spaceId: string;
  projectId: string;
  taskId: string;
  /** The most recent run executing in this workspace, if any. */
  runId?: string;
  /** Runtime driving the work (agent-os AgentSurface id, e.g. 'claude_code'). */
  runtimeId: string;
  substrate: WorkspaceSubstrate;
  /** Isolated branch created for this workspace. */
  branch: string;
  /** Base ref the branch was cut from. */
  baseRef: string;
  /** Absolute worktree path (tmux_worktree substrate) or sandbox id (daytona). */
  worktreePath?: string;
  /** Terminal session name (tmux) hosting the agent. */
  sessionName?: string;
  state: WorkspaceState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  metadata?: Record<string, unknown>;
};

const ALLOWED_TRANSITIONS: Record<WorkspaceState, readonly WorkspaceState[]> = {
  created: ['setting_up', 'failed', 'cancelled'],
  setting_up: ['ready', 'failed', 'cancelled'],
  ready: ['running', 'failed', 'cancelled'],
  running: ['awaiting_approval', 'awaiting_review', 'running', 'failed', 'cancelled'],
  awaiting_approval: ['running', 'failed', 'cancelled'],
  awaiting_review: ['merging', 'changes_requested', 'failed', 'cancelled'],
  changes_requested: ['running', 'failed', 'cancelled'],
  merging: ['merged', 'failed'],
  merged: ['archived'],
  failed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

export function isTerminalWorkspaceState(state: WorkspaceState): boolean {
  return TERMINAL_WORKSPACE_STATES.includes(state);
}

export function isAllowedWorkspaceTransition(from: WorkspaceState, to: WorkspaceState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Return a new Workspace transitioned to `to`, or throw on an illegal
 * transition. Immutable: never mutates the input.
 */
export function transitionWorkspace(
  workspace: Workspace,
  to: WorkspaceState,
  options: { now?: string; metadata?: Record<string, unknown> } = {},
): Workspace {
  if (workspace.state !== to && !isAllowedWorkspaceTransition(workspace.state, to)) {
    throw new Error(`Invalid workspace transition: ${workspace.state} -> ${to}`);
  }

  const now = options.now ?? new Date().toISOString();
  return {
    ...workspace,
    state: to,
    updatedAt: now,
    archivedAt: to === 'archived' ? now : workspace.archivedAt,
    metadata: {
      ...(workspace.metadata ?? {}),
      ...(options.metadata ?? {}),
    },
  };
}
