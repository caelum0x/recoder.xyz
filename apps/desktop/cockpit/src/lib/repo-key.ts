/**
 * repo-key — derive the stable per-repo key the conductor stores a setup script
 * under, mirroring the backend exactly so the cockpit reads/writes the SAME key.
 *
 * Source of truth: backend/src/domains/conductor/services/repo-setup.service.ts
 * (`repoKeyFor`). The backend runs a repo's setup script under
 * `repoKeyFor(projectId, repoPath)`; the settings pane MUST write the identical
 * key or the two would silently diverge. This is a pure re-derivation of that
 * function plus small display helpers — no fetch, no state.
 */
import type { Workspace } from '../types';

/**
 * Derive a stable, path-safe repo key from a projectId (preferred) or repoPath.
 * A projectId passes through lowercased; a path is normalized (every non
 * `[a-z0-9_-]` run → `__`). Empty input yields `'unknown'` — never a throw,
 * never a fabricated key. Kept byte-for-byte in step with the backend.
 */
export function repoKeyFor(
  projectId: string | undefined,
  repoPath: string | undefined,
): string {
  const raw = (projectId && projectId.trim()) || (repoPath && repoPath.trim()) || '';
  if (!raw) return 'unknown';
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
}

/** Read the original repo path off a workspace's untrusted metadata, if present. */
export function repoPathOf(workspace: Pick<Workspace, 'metadata'>): string | undefined {
  const raw = workspace.metadata?.repoPath;
  return typeof raw === 'string' && raw.trim() ? raw : undefined;
}

/** The repo key for one workspace — the key its setup script is stored under. */
export function workspaceRepoKey(
  workspace: Pick<Workspace, 'projectId' | 'metadata'>,
): string {
  return repoKeyFor(workspace.projectId, repoPathOf(workspace));
}

/** One repo the user can configure a setup script for (derived from workspaces). */
export interface RepoRef {
  /** The stable key used on the wire. */
  readonly repoKey: string;
  /** A friendly label for the picker (repo folder name, else the projectId). */
  readonly label: string;
}

/** Basename of a path (last non-empty segment), for a friendly repo label. */
function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/**
 * Build the de-duplicated list of repos from the current workspaces — the set the
 * settings pane lets the user configure. Keyed by the SAME repoKey the backend
 * uses, so a script written here applies to every workspace of that repo. Sorted
 * by label for a stable picker; empty when there are no workspaces.
 */
export function reposFromWorkspaces(
  workspaces: ReadonlyArray<Pick<Workspace, 'projectId' | 'metadata'>>,
): RepoRef[] {
  const byKey = new Map<string, RepoRef>();
  for (const ws of workspaces) {
    const repoKey = workspaceRepoKey(ws);
    if (byKey.has(repoKey)) continue;
    const path = repoPathOf(ws);
    const label = path ? basename(path) : ws.projectId || repoKey;
    byKey.set(repoKey, { repoKey, label });
  }
  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}
