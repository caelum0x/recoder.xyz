/**
 * Workspace-state presentation helpers — board columns, badges, and which
 * review actions are legal in which state. Action gating mirrors the backend
 * state machine (packages/agent-os/src/domain/workspace.ts ALLOWED_TRANSITIONS)
 * and the review/publish handlers, so the UI never offers an action the backend
 * would reject.
 */
import type { WorkspaceState } from '../types';

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

/** A diff is reviewable once the agent has produced work (running onward). */
export function canViewDiff(state: WorkspaceState): boolean {
  return ['running', 'awaiting_review', 'awaiting_approval', 'changes_requested', 'merging'].includes(
    state,
  );
}

/** PR can be opened while there is a live worktree to push (running/review). */
export function canOpenPr(state: WorkspaceState): boolean {
  return ['running', 'awaiting_review', 'changes_requested'].includes(state);
}

/** Merge is only meaningful once the work is up for review. */
export function canMerge(state: WorkspaceState): boolean {
  return state === 'awaiting_review';
}

/** Archive is reachable from terminal-ish states (and the backend cancels first). */
export function canArchive(state: WorkspaceState): boolean {
  return state !== 'archived';
}

export function isLive(state: WorkspaceState): boolean {
  return !['merged', 'failed', 'cancelled', 'archived'].includes(state);
}
