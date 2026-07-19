/**
 * Parallel-run group detection for the board (product F3).
 *
 * When the SAME task is launched across multiple agents, every sibling workspace
 * carries the SAME `metadata.taskGroup` (stamped by the parallel-launch path in
 * NewWorkspaceForm and persisted by the backend). This module derives those
 * groups from the plain GET /workspaces list the board already polls — so the
 * board can offer a "Compare N agents" affordance without a second fetch and
 * without inventing anything the backend did not send.
 *
 * A group is only surfaced when ≥2 workspaces share a taskGroup (a solo run has
 * nothing to compare against). The authoritative aggregate — per-agent diff
 * stat, live outcome, and the merge-this-one action — is fetched on demand from
 * GET /workspaces/compare?taskGroup= when the operator opens the compare panel.
 */
import type { Workspace } from '../types';
import { workspaceGoal } from './workspace-goal';

/** A detected parallel-run group backed by ≥2 real sibling workspaces. */
export interface ParallelRunGroup {
  /** The shared `metadata.taskGroup` key binding the siblings. */
  taskGroup: string;
  /** Number of siblings in the group (always ≥2 for a surfaced group). */
  count: number;
  /** The shared goal label (the siblings run the same task), never fabricated. */
  goal: string;
  /** The distinct agents in the group, in sibling order (for a compact preview). */
  agents: string[];
  /** The sibling workspaces, oldest-first (stable by workspaceId on a tie). */
  workspaces: Workspace[];
}

/** Read a workspace's shared group key from its metadata (absent/blank ⇒ undefined). */
export function taskGroupOf(workspace: Pick<Workspace, 'metadata'>): string | undefined {
  const raw = workspace.metadata?.taskGroup;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** Oldest-first, stable by workspaceId — mirrors the backend compare ordering. */
function bySiblingOrder(a: Workspace, b: Workspace): number {
  return a.createdAt.localeCompare(b.createdAt) || a.workspaceId.localeCompare(b.workspaceId);
}

/**
 * Derive the parallel-run groups (≥2 siblings) from the board's workspace list.
 * Groups are sorted most-recent-first (by the newest sibling's updatedAt) so the
 * freshest parallel run surfaces at the top of the board's compare bar.
 */
export function parallelRunGroups(workspaces: readonly Workspace[]): ParallelRunGroup[] {
  const byGroup = new Map<string, Workspace[]>();
  for (const ws of workspaces) {
    const group = taskGroupOf(ws);
    if (!group) continue;
    const existing = byGroup.get(group);
    if (existing) existing.push(ws);
    else byGroup.set(group, [ws]);
  }

  const groups: ParallelRunGroup[] = [];
  for (const [taskGroup, members] of byGroup) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(bySiblingOrder);
    groups.push({
      taskGroup,
      count: sorted.length,
      goal: workspaceGoal(sorted[0]),
      agents: distinct(sorted.map((w) => w.runtimeId)),
      workspaces: sorted,
    });
  }

  groups.sort((a, b) => newestUpdatedAt(b.workspaces) - newestUpdatedAt(a.workspaces));
  return groups;
}

function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function newestUpdatedAt(workspaces: readonly Workspace[]): number {
  let newest = 0;
  for (const ws of workspaces) {
    const t = new Date(ws.updatedAt).getTime();
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  return newest;
}
