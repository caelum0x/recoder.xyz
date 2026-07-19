/**
 * workspace-facets — derives the board's filter-chip options (repos/agents/states)
 * from real records only. Pure: no hooks, no DOM.
 */
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../types';
import { workspaceFacets } from './workspace-facets';

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

describe('workspaceFacets', () => {
  it('returns empty option lists for an empty board (never fabricates)', () => {
    expect(workspaceFacets([])).toEqual({ repos: [], agents: [], states: [] });
  });

  it('lists distinct repos sorted', () => {
    const list = [
      makeWorkspace({ projectId: 'acme/web' }),
      makeWorkspace({ projectId: 'acme/api' }),
      makeWorkspace({ projectId: 'acme/api' }),
    ];
    expect(workspaceFacets(list).repos).toEqual(['acme/api', 'acme/web']);
  });

  it('lists distinct agents sorted', () => {
    const list = [
      makeWorkspace({ runtimeId: 'codex' }),
      makeWorkspace({ runtimeId: 'claude_code' }),
      makeWorkspace({ runtimeId: 'codex' }),
    ];
    expect(workspaceFacets(list).agents).toEqual(['claude_code', 'codex']);
  });

  it('lists only the states present, in canonical lifecycle order', () => {
    const list = [
      makeWorkspace({ state: 'merged' }),
      makeWorkspace({ state: 'running' }),
      makeWorkspace({ state: 'ready' }),
      makeWorkspace({ state: 'running' }),
    ];
    // canonical order is ready < running < merged (not insertion / alphabetical).
    expect(workspaceFacets(list).states).toEqual(['ready', 'running', 'merged']);
  });

  it('ignores blank identity values', () => {
    const list = [makeWorkspace({ projectId: '', runtimeId: '   ' })];
    const facets = workspaceFacets(list);
    expect(facets.repos).toEqual([]);
    expect(facets.agents).toEqual([]);
  });
});
