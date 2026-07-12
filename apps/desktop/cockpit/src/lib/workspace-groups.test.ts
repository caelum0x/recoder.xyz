/**
 * Unit tests for groupWorkspacesByRepo — proves the sidebar groups real
 * workspaces by their projectId and never invents a repo.
 */
import { describe, expect, it } from 'vitest';
import { groupWorkspacesByRepo } from './workspace-groups';
import type { Workspace } from '../types';

function ws(over: Partial<Workspace>): Workspace {
  return {
    workspaceId: over.workspaceId || 'w',
    spaceId: 's',
    projectId: over.projectId || 'p',
    taskId: 't',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: over.branch || 'b',
    baseRef: 'main',
    worktreePath: over.worktreePath,
    state: over.state || 'running',
    createdBy: 'cockpit',
    createdAt: over.createdAt || '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt || '2026-01-01T00:00:00Z',
  };
}

describe('groupWorkspacesByRepo', () => {
  it('returns no groups for an empty list', () => {
    expect(groupWorkspacesByRepo([])).toEqual([]);
  });

  it('groups workspaces by projectId', () => {
    const groups = groupWorkspacesByRepo([
      ws({ workspaceId: 'a', projectId: 'repo-1' }),
      ws({ workspaceId: 'b', projectId: 'repo-2' }),
      ws({ workspaceId: 'c', projectId: 'repo-1' }),
    ]);
    expect(groups).toHaveLength(2);
    const repo1 = groups.find((g) => g.projectId === 'repo-1');
    expect(repo1?.workspaces.map((w) => w.workspaceId).sort()).toEqual(['a', 'c']);
  });

  it('derives a readable repo label from a worktree path', () => {
    const groups = groupWorkspacesByRepo([
      ws({ projectId: 'p1', worktreePath: '/Users/op/code/my-app/.worktrees/abc123' }),
    ]);
    expect(groups[0].label).toBe('my-app');
  });

  it('falls back to projectId when no worktree path is present', () => {
    const groups = groupWorkspacesByRepo([ws({ projectId: 'plain-project' })]);
    expect(groups[0].label).toBe('plain-project');
  });

  it("presents the generic 'default' projectId as 'Local project'", () => {
    const groups = groupWorkspacesByRepo([ws({ projectId: 'default' })]);
    expect(groups[0].label).toBe('Local project');
  });

  it('collapses a path-like projectId to its basename', () => {
    const groups = groupWorkspacesByRepo([ws({ projectId: '/Users/op/code/widget' })]);
    expect(groups[0].label).toBe('widget');
  });

  it('sorts workspaces within a group by most-recently-updated first', () => {
    const groups = groupWorkspacesByRepo([
      ws({ workspaceId: 'old', projectId: 'p', updatedAt: '2026-01-01T00:00:00Z' }),
      ws({ workspaceId: 'new', projectId: 'p', updatedAt: '2026-06-01T00:00:00Z' }),
    ]);
    expect(groups[0].workspaces.map((w) => w.workspaceId)).toEqual(['new', 'old']);
  });

  it('sorts groups alphabetically by label', () => {
    const groups = groupWorkspacesByRepo([
      ws({ projectId: 'zebra' }),
      ws({ projectId: 'alpha' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['alpha', 'zebra']);
  });
});
