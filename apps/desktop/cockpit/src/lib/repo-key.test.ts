/**
 * repo-key — the cockpit's re-derivation of the backend's stable repo key MUST
 * match `repoKeyFor` in repo-setup.service.ts byte-for-byte, or the settings
 * pane would write a script the conductor never reads. These tests pin that
 * contract plus the display helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  repoKeyFor,
  repoPathOf,
  reposFromWorkspaces,
  workspaceRepoKey,
} from './repo-key';
import type { Workspace } from '../types';

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-1',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    state: 'running',
    createdBy: 'op',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Workspace;
}

describe('repoKeyFor (mirrors the backend)', () => {
  it('lowercases a projectId and passes it through when path-safe', () => {
    expect(repoKeyFor('MyRepo', undefined)).toBe('myrepo');
    expect(repoKeyFor('default', undefined)).toBe('default');
  });

  it('normalizes each non path-safe run to __', () => {
    expect(repoKeyFor(undefined, '/Users/me/dev/My App')).toBe('__users__me__dev__my__app');
    expect(repoKeyFor('a b/c', undefined)).toBe('a__b__c');
  });

  it('prefers projectId over repoPath (matches backend precedence)', () => {
    expect(repoKeyFor('proj', '/some/path')).toBe('proj');
  });

  it('falls back to unknown for empty / whitespace input — never throws', () => {
    expect(repoKeyFor('', '')).toBe('unknown');
    expect(repoKeyFor('   ', undefined)).toBe('unknown');
    expect(repoKeyFor(undefined, undefined)).toBe('unknown');
  });
});

describe('repoPathOf', () => {
  it('reads a string repoPath off metadata', () => {
    expect(repoPathOf(workspace({ metadata: { repoPath: '/x/y' } }))).toBe('/x/y');
  });
  it('ignores a non-string / empty repoPath', () => {
    expect(repoPathOf(workspace({ metadata: { repoPath: 42 } }))).toBeUndefined();
    expect(repoPathOf(workspace({ metadata: {} }))).toBeUndefined();
    expect(repoPathOf(workspace())).toBeUndefined();
  });
});

describe('workspaceRepoKey', () => {
  it('keys off projectId', () => {
    expect(workspaceRepoKey(workspace({ projectId: 'Recoder' }))).toBe('recoder');
  });
});

describe('reposFromWorkspaces', () => {
  it('de-duplicates by repoKey and prefers a folder-name label', () => {
    const repos = reposFromWorkspaces([
      workspace({ workspaceId: 'a', projectId: 'proj-1', metadata: { repoPath: '/home/me/alpha' } }),
      workspace({ workspaceId: 'b', projectId: 'proj-1', metadata: { repoPath: '/home/me/alpha' } }),
      workspace({ workspaceId: 'c', projectId: 'proj-2' }),
    ]);
    expect(repos).toHaveLength(2);
    const alpha = repos.find((r) => r.repoKey === 'proj-1');
    expect(alpha?.label).toBe('alpha');
    const two = repos.find((r) => r.repoKey === 'proj-2');
    expect(two?.label).toBe('proj-2');
  });

  it('sorts by label and is empty for no workspaces', () => {
    expect(reposFromWorkspaces([])).toEqual([]);
    const repos = reposFromWorkspaces([
      workspace({ projectId: 'zebra' }),
      workspace({ projectId: 'apple' }),
    ]);
    expect(repos.map((r) => r.label)).toEqual(['apple', 'zebra']);
  });
});
