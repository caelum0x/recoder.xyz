/**
 * Truthful per-workspace diff-stat extraction for the sidebar +N/-N badge.
 *
 * The conductor attaches a real delivery summary to a workspace's metadata when
 * the agent finishes (completion-watcher.ts -> advanceWorkspace(..., {
 * delivery: { changedFiles, success, diffStat } })). `diffStat` is the raw
 * `git diff --stat` summary line, e.g.
 *   " 3 files changed, 12 insertions(+), 4 deletions(-)".
 *
 * We parse ONLY what the backend really sent. When no delivery summary is
 * present yet (the agent has not produced reviewable work), we return null and
 * the sidebar shows no stat — never a fabricated 0/0 or a guessed number.
 *
 * Source of truth:
 *  - docker-backend/src/conductor/completion-watcher.ts (metadata.delivery)
 *  - docker-backend/src/conductor/delivery-summary.ts (diffStat = git diff --stat)
 */
import type { Workspace } from '../types';

export interface WorkspaceDiffStat {
  /** Files changed, from the delivery summary's `changedFiles` (authoritative). */
  changedFiles: number;
  /** Inserted lines parsed from the git --stat summary, or null if absent. */
  additions: number | null;
  /** Deleted lines parsed from the git --stat summary, or null if absent. */
  deletions: number | null;
}

interface DeliveryMeta {
  changedFiles?: unknown;
  diffStat?: unknown;
}

function readDelivery(metadata: Record<string, unknown> | undefined): DeliveryMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const delivery = (metadata as Record<string, unknown>).delivery;
  if (!delivery || typeof delivery !== 'object') return null;
  return delivery as DeliveryMeta;
}

/**
 * Parse the inserted/deleted line counts out of a `git diff --stat` summary
 * line. Returns null for a count the summary did not mention (git omits the
 * "0 insertions" / "0 deletions" clause), so we never invent a zero.
 */
function parseStatCounts(diffStat: string): { additions: number | null; deletions: number | null } {
  // git renders "N insertion(s)(+)" / "N deletion(s)(-)" in the summary line.
  const ins = /(\d+)\s+insertions?\(\+\)/.exec(diffStat);
  const del = /(\d+)\s+deletions?\(-\)/.exec(diffStat);
  return {
    additions: ins ? Number(ins[1]) : null,
    deletions: del ? Number(del[1]) : null,
  };
}

/**
 * Extract the truthful diff stat for a workspace from its persisted delivery
 * summary, or null when the backend has not produced one yet.
 */
export function workspaceDiffStat(
  workspace: Pick<Workspace, 'metadata'>,
): WorkspaceDiffStat | null {
  const delivery = readDelivery(workspace.metadata);
  if (!delivery) return null;

  const changedFiles = typeof delivery.changedFiles === 'number' ? delivery.changedFiles : 0;
  const diffStat = typeof delivery.diffStat === 'string' ? delivery.diffStat : '';
  const { additions, deletions } = parseStatCounts(diffStat);

  // Nothing meaningful to show: no files changed and no parsed line counts.
  if (changedFiles === 0 && additions === null && deletions === null) return null;

  return { changedFiles, additions, deletions };
}
