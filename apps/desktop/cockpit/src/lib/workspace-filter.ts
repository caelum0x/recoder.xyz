/**
 * workspace-filter — the board's INSTANT, client-side search/filter over the loaded
 * workspace list. Mirrors the backend `services/workspace-query.service.ts` matching
 * so an in-cockpit `q` narrows the same set the `GET /workspaces?q=` edge would
 * return, without a round-trip. Pure + preact-safe (no React, no hooks): a component
 * calls `filterWorkspaces(list, filters)` in render and shows the result.
 *
 * Free-text `q` matches the friendly codename the board shows PLUS repo, branch,
 * task, goal/prompt, and the agent runtime id. An empty filter returns the list
 * unchanged; a filter that matches nothing returns `[]` (a truthful empty board,
 * never a broadened one).
 */
import type { Workspace, WorkspaceState } from '../types';
import { workspaceCodename } from './workspace-codename';

export interface WorkspaceFilters {
  /** Free-text (case-insensitive) over codename/repo/branch/task/goal/agent. */
  q?: string;
  /** Case-insensitive substring over the repo identity (projectId/lockScope/worktree). */
  repo?: string;
  /** Case-insensitive substring over the runtime/agent id. */
  agent?: string;
  /** Exact workspace state. */
  state?: WorkspaceState;
  /** Tri-state: true = only archived, false = only non-archived, undefined = both. */
  archived?: boolean;
}

function lockScopeRepo(w: Workspace): string {
  const scope = w.metadata?.lockScope;
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    const repo = (scope as Record<string, unknown>).repo;
    if (typeof repo === 'string') return repo;
  }
  return '';
}

function promptText(w: Workspace): string {
  const prompt = w.metadata?.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

function repoHaystack(w: Workspace): string {
  return [w.projectId, lockScopeRepo(w), w.worktreePath ?? ''].filter(Boolean).join(' ');
}

function isArchived(w: Workspace): boolean {
  return w.state === 'archived' || Boolean(w.archivedAt);
}

function freeTextHaystack(w: Workspace): string {
  return [
    workspaceCodename(w.workspaceId),
    w.workspaceId,
    repoHaystack(w),
    w.branch,
    w.taskId,
    promptText(w),
    w.runtimeId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function containsCI(haystack: string, needle: string | undefined): boolean {
  const q = (needle ?? '').trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function matchesWorkspaceFilters(w: Workspace, filters: WorkspaceFilters): boolean {
  if (filters.archived !== undefined && isArchived(w) !== filters.archived) return false;
  if (filters.state !== undefined && w.state !== filters.state) return false;
  if (!containsCI(repoHaystack(w), filters.repo)) return false;
  if (!containsCI(w.runtimeId, filters.agent)) return false;
  const q = (filters.q ?? '').trim().toLowerCase();
  if (q && !freeTextHaystack(w).includes(q)) return false;
  return true;
}

/** Filter a workspace list by the board filters (pure, immutable, order-preserving). */
export function filterWorkspaces(
  workspaces: readonly Workspace[],
  filters: WorkspaceFilters,
): Workspace[] {
  return workspaces.filter((w) => matchesWorkspaceFilters(w, filters));
}

/** Whether any narrowing filter is active (for a "showing N of M" / clear-filters affordance). */
export function hasActiveFilters(filters: WorkspaceFilters): boolean {
  return Boolean(
    (filters.q && filters.q.trim()) ||
      (filters.repo && filters.repo.trim()) ||
      (filters.agent && filters.agent.trim()) ||
      filters.state !== undefined ||
      filters.archived !== undefined,
  );
}
