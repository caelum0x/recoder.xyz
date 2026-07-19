/**
 * workspace-filter — the board's instant client-side search/filter. Mirrors the
 * backend query service so the same `q`/repo/agent/state/archived narrows the same
 * set locally.
 */
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../types';
import {
  filterWorkspaces,
  hasActiveFilters,
  matchesWorkspaceFilters,
} from './workspace-filter';
import { workspaceCodename } from './workspace-codename';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 'space_1',
    projectId: 'acme/api',
    taskId: 'task_1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'feat/login',
    baseRef: 'main',
    state: 'running',
    createdBy: 'user_1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterWorkspaces', () => {
  it('filters by repo (projectId) case-insensitively', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', projectId: 'acme/api' }),
      makeWorkspace({ workspaceId: 'ws_b', projectId: 'acme/web' }),
    ];
    expect(filterWorkspaces(list, { repo: 'API' }).map((w) => w.workspaceId)).toEqual(['ws_a']);
  });

  it('filters by agent (runtimeId)', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', runtimeId: 'claude_code' }),
      makeWorkspace({ workspaceId: 'ws_b', runtimeId: 'codex' }),
    ];
    expect(filterWorkspaces(list, { agent: 'codex' }).map((w) => w.workspaceId)).toEqual(['ws_b']);
  });

  it('filters by exact state', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', state: 'running' }),
      makeWorkspace({ workspaceId: 'ws_b', state: 'awaiting_review' }),
    ];
    expect(filterWorkspaces(list, { state: 'awaiting_review' }).map((w) => w.workspaceId)).toEqual([
      'ws_b',
    ]);
  });

  it('archived tri-state hides/keeps archived records', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_live', state: 'running' }),
      makeWorkspace({ workspaceId: 'ws_gone', state: 'archived', archivedAt: '2026-07-02T00:00:00.000Z' }),
    ];
    expect(filterWorkspaces(list, { archived: false }).map((w) => w.workspaceId)).toEqual(['ws_live']);
    expect(filterWorkspaces(list, { archived: true }).map((w) => w.workspaceId)).toEqual(['ws_gone']);
    expect(filterWorkspaces(list, {}).map((w) => w.workspaceId)).toEqual(['ws_live', 'ws_gone']);
  });

  it('free-text q matches the goal/prompt and branch', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', metadata: { prompt: 'Add SSO login' } }),
      makeWorkspace({ workspaceId: 'ws_b', branch: 'fix/cache' }),
    ];
    expect(filterWorkspaces(list, { q: 'sso' }).map((w) => w.workspaceId)).toEqual(['ws_a']);
    expect(filterWorkspaces(list, { q: 'cache' }).map((w) => w.workspaceId)).toEqual(['ws_b']);
  });

  it('free-text q matches the friendly codename the board shows', () => {
    const ws = makeWorkspace({ workspaceId: 'ws_ea6c7cc1' });
    const firstWord = workspaceCodename('ws_ea6c7cc1').split('-')[0];
    expect(filterWorkspaces([ws], { q: firstWord })).toContain(ws);
  });

  it('returns a truthful empty list when nothing matches', () => {
    const list = [makeWorkspace({ workspaceId: 'ws_a' })];
    expect(filterWorkspaces(list, { q: 'nonexistent-xyz' })).toEqual([]);
  });

  it('an empty filter returns every record without mutating input', () => {
    const list = [makeWorkspace({ workspaceId: 'ws_a' }), makeWorkspace({ workspaceId: 'ws_b' })];
    const result = filterWorkspaces(list, {});
    expect(result.map((w) => w.workspaceId)).toEqual(['ws_a', 'ws_b']);
    expect(result).not.toBe(list);
  });
});

describe('matchesWorkspaceFilters', () => {
  it('ANDs filters together', () => {
    const ws = makeWorkspace({ projectId: 'acme/api', runtimeId: 'codex', state: 'running' });
    expect(matchesWorkspaceFilters(ws, { repo: 'acme/api', agent: 'codex', state: 'running' })).toBe(true);
    expect(matchesWorkspaceFilters(ws, { repo: 'acme/api', agent: 'claude' })).toBe(false);
  });
});

describe('hasActiveFilters', () => {
  it('is false for an empty filter and true when any field narrows', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: '  ' })).toBe(false);
    expect(hasActiveFilters({ q: 'x' })).toBe(true);
    expect(hasActiveFilters({ archived: false })).toBe(true);
    expect(hasActiveFilters({ state: 'running' })).toBe(true);
  });
});
