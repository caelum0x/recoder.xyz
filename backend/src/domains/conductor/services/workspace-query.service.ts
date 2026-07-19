/**
 * Workspace query service — the pure, side-effect-free filter behind the board's
 * search / filter / archived-history surface (`GET /workspaces?q=&repo=&agent=&state=&archived=`
 * and `GET /workspaces/archived`).
 *
 * Design: a pure function over an already-fetched `Workspace[]`. The module fetches
 * the state-of-record list (via the engine/repository) and hands it here; this file
 * owns ONLY the matching logic so it is trivially unit-testable without a DB, a
 * substrate, or the network. Read-only by construction — no gate, no audit, no
 * mutation (it never transitions or persists anything).
 *
 * Truthfulness: an empty result is a real, honest empty list — filters that match
 * nothing return `[]`, never a fabricated or "helpfully broadened" set. Ordering is
 * preserved from the input except where a caller explicitly asks for recency sort
 * (archived history), keeping the behavior predictable.
 */
import type { Workspace, WorkspaceState } from '@recoder/agent-os';
import { workspaceCodename } from './workspace-codename.js';

/**
 * Board filter inputs. Every field is optional; an absent field is "no constraint".
 *
 * - `q`        free-text, case-insensitive; matches the workspace CODENAME, repo,
 *              branch, task id, the recorded prompt/goal, and the runtime/agent id.
 * - `repo`     case-insensitive substring over the repo identity (projectId, the
 *              persisted lock-scope repo path, and the worktree path).
 * - `agent`    case-insensitive substring over the runtime id (e.g. `claude`).
 * - `state`    EXACT workspace state (`running`, `awaiting_review`, …).
 * - `archived` tri-state: `true` = only archived, `false` = only non-archived,
 *              `undefined` = no archived constraint (both).
 */
export interface WorkspaceQueryFilters {
  readonly q?: string;
  readonly repo?: string;
  readonly agent?: string;
  readonly state?: WorkspaceState;
  readonly archived?: boolean;
}

/** Read `metadata.lockScope.repo` (the origin repo path) if the engine persisted it. */
function lockScopeRepo(workspace: Workspace): string {
  const scope = workspace.metadata?.lockScope;
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    const repo = (scope as Record<string, unknown>).repo;
    if (typeof repo === 'string') return repo;
  }
  return '';
}

/** Read `metadata.prompt` (the original goal text used as the human label). */
function promptText(workspace: Workspace): string {
  const prompt = workspace.metadata?.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

/** The repo identity surface a `repo=` filter (and free-text `q`) matches against. */
function repoHaystack(workspace: Workspace): string {
  return [workspace.projectId, lockScopeRepo(workspace), workspace.worktreePath ?? '']
    .filter(Boolean)
    .join(' ');
}

/** Whether a workspace record is in the archived history. */
function isArchived(workspace: Workspace): boolean {
  return workspace.state === 'archived' || Boolean(workspace.archivedAt);
}

/**
 * The full free-text haystack for `q`: the friendly codename PLUS every field a
 * user might type — repo, branch, task id, goal/prompt, and the agent runtime id.
 */
function freeTextHaystack(workspace: Workspace): string {
  return [
    workspaceCodename(workspace.workspaceId),
    workspace.workspaceId,
    repoHaystack(workspace),
    workspace.branch,
    workspace.taskId,
    promptText(workspace),
    workspace.runtimeId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Case-insensitive, whitespace-tolerant substring test (empty needle ⇒ no constraint). */
function containsCI(haystack: string, needle: string | undefined): boolean {
  const q = (needle ?? '').trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

/** True when `workspace` satisfies EVERY provided filter (AND semantics). */
export function matchesWorkspaceFilters(
  workspace: Workspace,
  filters: WorkspaceQueryFilters,
): boolean {
  if (filters.archived !== undefined && isArchived(workspace) !== filters.archived) return false;
  if (filters.state !== undefined && workspace.state !== filters.state) return false;
  if (!containsCI(repoHaystack(workspace), filters.repo)) return false;
  if (!containsCI(workspace.runtimeId, filters.agent)) return false;
  if (filters.q !== undefined && filters.q.trim() && !freeTextHaystack(workspace).includes(filters.q.trim().toLowerCase())) {
    return false;
  }
  return true;
}

/**
 * Filter a workspace list by the board filters. Pure + immutable: returns a NEW
 * array, never mutates the input, and preserves input order. An all-empty filter
 * object returns the list unchanged (every record passes).
 */
export function filterWorkspaces(
  workspaces: readonly Workspace[],
  filters: WorkspaceQueryFilters,
): Workspace[] {
  return workspaces.filter((workspace) => matchesWorkspaceFilters(workspace, filters));
}

/** Most-recent-first by `archivedAt` (falling back to `updatedAt`) — for history views. */
export function sortByRecencyDesc(workspaces: readonly Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const at = a.archivedAt ?? a.updatedAt;
    const bt = b.archivedAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });
}

/** Normalize a raw HTTP `archived` query param into the tri-state filter value. */
export function parseArchivedParam(raw: unknown): boolean | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}
