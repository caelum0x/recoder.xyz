/**
 * Workspace-state presentation helpers — board columns, badges, and which
 * review actions are legal in which state. Action gating mirrors the backend
 * state machine (packages/agent-os/src/domain/workspace.ts ALLOWED_TRANSITIONS)
 * and the review/publish handlers, so the UI never offers an action the backend
 * would reject.
 */
import type { Workspace, WorkspaceState } from '../types';

export interface BoardColumn {
  id: string;
  title: string;
  states: WorkspaceState[];
}

/** conductor.build-style columns grouping the lifecycle states. */
export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'queued', title: 'Queued', states: ['created', 'setting_up', 'ready'] },
  { id: 'running', title: 'Running', states: ['running', 'awaiting_approval', 'changes_requested'] },
  { id: 'review', title: 'Review', states: ['awaiting_review', 'merging'] },
  { id: 'done', title: 'Done', states: ['merged', 'failed', 'cancelled', 'archived'] },
];

const STATE_TONE: Record<WorkspaceState, string> = {
  created: 'neutral',
  setting_up: 'progress',
  ready: 'progress',
  running: 'active',
  awaiting_approval: 'warn',
  awaiting_review: 'warn',
  changes_requested: 'warn',
  merging: 'progress',
  merged: 'good',
  failed: 'bad',
  cancelled: 'neutral',
  archived: 'neutral',
};

export function stateTone(state: WorkspaceState): string {
  return STATE_TONE[state] ?? 'neutral';
}

export function stateLabel(state: WorkspaceState): string {
  return state.replace(/_/g, ' ');
}

/**
 * The human "state pill" copy the Conductor desktop UI shows on each workspace
 * row (Running / Ready to review / Merge conflicts / Merged …). Derived purely
 * from the truthful backend state — no fabrication. A detected write-lock
 * collision overrides the label to "Merge conflicts" to match the reference.
 */
export function statePill(state: WorkspaceState, collision = false): string {
  if (collision) return 'Merge conflicts';
  switch (state) {
    case 'created':
      return 'Queued';
    case 'setting_up':
      return 'Setting up';
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Running';
    case 'awaiting_approval':
      return 'Awaiting approval';
    case 'awaiting_review':
      return 'Ready to review';
    case 'changes_requested':
      return 'Changes requested';
    case 'merging':
      return 'Merging';
    case 'merged':
      return 'Merged';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'archived':
      return 'Archived';
    default:
      return stateLabel(state);
  }
}

/**
 * A diff is reviewable once the agent has produced work (running onward).
 * `failed` is included because a workspace whose merge failed still has its
 * worktree with the agent's changes — the user must be able to SEE what the
 * agent did (and re-merge it). The diff route degrades truthfully when the
 * worktree is gone (e.g. a launch failure).
 */
export function canViewDiff(state: WorkspaceState): boolean {
  return ['running', 'awaiting_review', 'awaiting_approval', 'changes_requested', 'merging', 'failed'].includes(
    state,
  );
}

/** PR can be opened while there is a live worktree to push (running/review). */
export function canOpenPr(state: WorkspaceState): boolean {
  return ['running', 'awaiting_review', 'changes_requested'].includes(state);
}

/**
 * Merge is meaningful once the work is up for review — and again from `failed`,
 * where a prior merge attempt failed but the worktree still holds the agent's
 * work. The backend restores a failed-with-mergeError workspace to review and
 * re-merges (and rejects truthfully when it is not actually re-mergeable).
 */
export function canMerge(state: WorkspaceState): boolean {
  return state === 'awaiting_review' || state === 'failed';
}

/** Archive is reachable from terminal-ish states (and the backend cancels first). */
export function canArchive(state: WorkspaceState): boolean {
  return state !== 'archived';
}

export function isLive(state: WorkspaceState): boolean {
  return !['merged', 'failed', 'cancelled', 'archived'].includes(state);
}

/** One conflicting lock the workspace's launch contended with. */
export interface LockConflict {
  lockId?: string;
  /** The workspace that already holds the conflicting write-lock. */
  ownerAgentId?: string;
  taskId?: string;
  pathGlob?: string;
}

/**
 * Detect a write-lock collision on a workspace from its persisted metadata.
 *
 * The conductor (workspace-service.ts) transitions a workspace to `failed` with
 * `metadata.error = "write-lock conflict: <glob> held by workspace <owner> …"`
 * and a structured `metadata.lockConflicts` array when a launch is refused
 * because another active workspace already holds overlapping write scope. This
 * surfaces that truthfully to the operator — no new endpoint needed; the message
 * is already in the GET /workspaces payload.
 *
 * Returns `null` when the workspace is not a lock-conflict failure.
 */
export function lockConflict(
  workspace: Pick<Workspace, 'state' | 'metadata'>,
): { message: string; conflicts: LockConflict[] } | null {
  if (workspace.state !== 'failed') return null;
  const meta = workspace.metadata;
  if (!meta || typeof meta !== 'object') return null;

  const rawError = (meta as Record<string, unknown>).error;
  const message = typeof rawError === 'string' ? rawError : '';
  const isLockConflict = message.toLowerCase().startsWith('write-lock conflict');

  const rawConflicts = (meta as Record<string, unknown>).lockConflicts;
  const conflicts: LockConflict[] = Array.isArray(rawConflicts)
    ? rawConflicts.map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        return {
          lockId: typeof o.lockId === 'string' ? o.lockId : undefined,
          ownerAgentId: typeof o.ownerAgentId === 'string' ? o.ownerAgentId : undefined,
          taskId: typeof o.taskId === 'string' ? o.taskId : undefined,
          pathGlob: typeof o.pathGlob === 'string' ? o.pathGlob : undefined,
        };
      })
    : [];

  // Only treat as a collision when the truthful conflict signal is present:
  // either the structured array or the canonical message prefix.
  if (!isLockConflict && conflicts.length === 0) return null;

  return {
    message: message || 'write-lock conflict: launch refused (overlapping write scope held by another workspace)',
    conflicts,
  };
}
