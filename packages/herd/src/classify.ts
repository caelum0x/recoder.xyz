/**
 * Herd status — the operator-facing triage of a conductor workspace:
 * does it need YOU (blocked on review/approval), is the agent working,
 * did it fail, or is it done. Total over WorkspaceState so a new lifecycle
 * state can never silently vanish from the herd view.
 */
import type { Workspace, WorkspaceState } from '@recoder/agent-os';

export type HerdStatus = 'needs_you' | 'working' | 'failed' | 'done';

/** Render/attention order: operator attention first, history last. */
export const HERD_STATUS_ORDER: readonly HerdStatus[] = [
  'needs_you',
  'working',
  'failed',
  'done',
];

const STATUS_BY_STATE: Record<WorkspaceState, HerdStatus> = {
  created: 'working',
  setting_up: 'working',
  ready: 'working',
  running: 'working',
  merging: 'working',
  awaiting_approval: 'needs_you',
  awaiting_review: 'needs_you',
  changes_requested: 'needs_you',
  merged: 'done',
  cancelled: 'done',
  archived: 'done',
  failed: 'failed',
};

export function herdStatus(
  state: WorkspaceState,
  opts?: { waiting?: boolean },
): HerdStatus {
  const base = STATUS_BY_STATE[state] ?? 'working';
  // An agent blocked on an interactive prompt needs the operator NOW — but only
  // while it is actually working; review/terminal states keep their triage.
  if (opts?.waiting && base === 'working') return 'needs_you';
  return base;
}

/** The human label for a workspace: its GOAL (metadata.prompt), else the branch. */
export function goalLabel(w: Workspace): string {
  const prompt = w.metadata?.['prompt'];
  return typeof prompt === 'string' && prompt.trim() ? prompt : w.branch;
}
