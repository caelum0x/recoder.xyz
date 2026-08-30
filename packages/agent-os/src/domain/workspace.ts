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

import type { TenantContext } from './tenant-context';

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

export const TERMINAL_WORKSPACE_STATES: readonly WorkspaceState[] = [
  'archived',
] as const;

/**
 * Substrate the workspace's execution runs on.
 *
 * - `tmux_worktree` — local git worktree + persistent tmux session (default).
 * - `daytona`       — remote Daytona sandbox.
 * - `in_process`    — local git worktree, agent driven in-process by
 *                     `@recoder/runtime`'s in-process driver (no tmux, no child
 *                     CLI). Opt-in only; never the default. Selected solely when a
 *                     Workspace is explicitly created with `substrate: 'in_process'`.
 * - `ssh`           — remote git worktree + tmux on an SSH host (durable SSH),
 *                     driven over an injected ssh-exec transport. Opt-in only;
 *                     selected solely when SSH host env is configured (else the
 *                     substrate is never registered and the selection degrades to
 *                     `tmux_worktree`).
 * - `acp`           — local git worktree driving an Agent Client Protocol agent
 *                     (`claude-code-acp`) over JSON-RPC/stdio instead of a PTY.
 *                     Opt-in only; registered when the ACP agent binary is on PATH.
 * - `loom`         — the default desktop substrate: vendored `loom` headless server
 *                     driving native git worktrees + PTYs with native agent status.
 *                     Operators may explicitly disable it and fall back to tmux;
 *                     an unhealthy daemon fails loud instead of silently switching.
 */
export type WorkspaceSubstrate =
  'tmux_worktree' | 'daytona' | 'in_process' | 'ssh' | 'acp' | 'loom';

/** Policy effects available to a workspace-owned governed tool call. */
export type WorkspaceToolPolicyEffect = 'allow' | 'needs_approval' | 'deny';

/** One exact governed tool override; unmatched tools use `defaultToolEffect`. */
export type WorkspaceToolPolicyRule = {
  toolName: string;
  effect: WorkspaceToolPolicyEffect;
  reason?: string;
};

/**
 * Durable policy constitution for one workspace. It is deliberately action-level:
 * signed skill actions and `swarm.unblock` both resolve to exact governed tool
 * names, so one profile becomes their shared authority without free-form code.
 */
export type WorkspacePolicyProfile = {
  version: 1;
  revision: number;
  defaultToolEffect: WorkspaceToolPolicyEffect;
  toolRules: WorkspaceToolPolicyRule[];
  swarm: {
    autoAnswer: boolean;
    minConfidence: number;
  };
  updatedAt?: string;
  updatedBy?: string;
};

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
  /** Substrate-owned live session address (tmux session or Loom pane id). */
  sessionName?: string;
  state: WorkspaceState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  /** Durable per-workspace authority for governed skills and swarm auto-unblock. */
  policyProfile?: WorkspacePolicyProfile;
  metadata?: Record<string, unknown>;
  /** Tenancy binding. Absent on legacy/embedded records (resolves to LOCAL_TENANT). */
  tenant?: TenantContext;
};

const ALLOWED_TRANSITIONS: Record<WorkspaceState, readonly WorkspaceState[]> = {
  created: ['setting_up', 'failed', 'cancelled'],
  setting_up: ['ready', 'failed', 'cancelled'],
  ready: ['running', 'failed', 'cancelled'],
  running: [
    'awaiting_approval',
    'awaiting_review',
    'running',
    'failed',
    'cancelled',
  ],
  awaiting_approval: ['running', 'failed', 'cancelled'],
  awaiting_review: ['merging', 'changes_requested', 'failed', 'cancelled'],
  changes_requested: ['running', 'failed', 'cancelled'],
  merging: ['merged', 'failed', 'awaiting_review'],
  merged: ['archived'],
  // `failed` is recoverable, not terminal: a workspace that failed at the delivery
  // (merge) step can be returned to review and re-merged once the cause is fixed.
  failed: ['archived', 'awaiting_review'],
  cancelled: ['archived'],
  archived: [],
};

export function isTerminalWorkspaceState(state: WorkspaceState): boolean {
  return TERMINAL_WORKSPACE_STATES.includes(state);
}

export function isAllowedWorkspaceTransition(
  from: WorkspaceState,
  to: WorkspaceState
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Return a new Workspace transitioned to `to`, or throw on an illegal
 * transition. Immutable: never mutates the input.
 */
export function transitionWorkspace(
  workspace: Workspace,
  to: WorkspaceState,
  options: { now?: string; metadata?: Record<string, unknown> } = {}
): Workspace {
  if (
    workspace.state !== to &&
    !isAllowedWorkspaceTransition(workspace.state, to)
  ) {
    throw new Error(
      `Invalid workspace transition: ${workspace.state} -> ${to}`
    );
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
