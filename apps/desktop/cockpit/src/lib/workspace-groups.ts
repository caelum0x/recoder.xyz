/**
 * Group workspaces by repo for the Conductor-style left sidebar.
 *
 * The conductor's serialized Workspace (packages/agent-os/src/domain/workspace.ts)
 * carries a stable `projectId` per repo but not a top-level repoPath. We group on
 * `projectId` (the authoritative, always-present key) and pick a human-readable
 * label from a worktree path basename when one is present, otherwise the
 * projectId itself. No repo is invented — every group is backed by real
 * workspaces returned from GET /workspaces.
 */
import type { Workspace } from '../types';

export interface WorkspaceGroup {
  /** The grouping key — the workspace projectId. */
  projectId: string;
  /** A readable repo label derived from real data (never fabricated). */
  label: string;
  /** The workspaces in this repo group, in the order received. */
  workspaces: Workspace[];
}

/**
 * Derive a readable repo name. Conductor worktrees live at
 * `<reposRoot>/<repo>/.worktrees/<id>` or similar; we take the path segment that
 * names the repo when it is discernible, else fall back to the projectId.
 */
function repoLabel(workspace: Workspace): string {
  const wt = workspace.worktreePath;
  if (wt && typeof wt === 'string') {
    // Normalize separators and drop trailing slashes.
    const segments = wt.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
    // Skip a trailing worktree id / ".worktrees" marker to find the repo dir.
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg === '.worktrees' || seg === 'worktrees') {
        if (i > 0) return segments[i - 1];
      }
    }
  }
  return readableProjectId(workspace.projectId);
}

/**
 * Make a raw projectId presentable: the generic 'default' becomes 'Local
 * project', a path-like id collapses to its basename, otherwise it's used as-is.
 * Never invents a name — just formats the real key.
 */
function readableProjectId(projectId: string): string {
  if (!projectId || projectId === 'default') return 'Local project';
  if (projectId.includes('/') || projectId.includes('\\')) {
    const base = projectId.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean).pop();
    return base || projectId;
  }
  return projectId;
}

/**
 * Group + sort workspaces for the sidebar. Groups are sorted by label; within a
 * group, the most recently updated workspace comes first so active work surfaces
 * at the top.
 */
export function groupWorkspacesByRepo(workspaces: Workspace[]): WorkspaceGroup[] {
  const byProject = new Map<string, WorkspaceGroup>();

  for (const ws of workspaces) {
    const existing = byProject.get(ws.projectId);
    if (existing) {
      existing.workspaces.push(ws);
    } else {
      byProject.set(ws.projectId, {
        projectId: ws.projectId,
        label: repoLabel(ws),
        workspaces: [ws],
      });
    }
  }

  const groups = Array.from(byProject.values());
  for (const group of groups) {
    group.workspaces.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}
