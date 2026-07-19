/**
 * Workspace query service — the pure board search / filter / archived-history logic.
 *
 * Proves: each filter field narrows correctly (repo, agent, state, archived tri-state),
 * free-text `q` matches the friendly codename AND the goal/branch/task fields, filters
 * AND together, an unmatched filter yields a truthful EMPTY list, the input is never
 * mutated, and archived history sorts most-recent-first.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import {
  filterWorkspaces,
  matchesWorkspaceFilters,
  parseArchivedParam,
  sortByRecencyDesc,
} from './workspace-query.service.js';
import { workspaceCodename } from './workspace-codename.js';

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
  it('filters by exact repo (projectId) substring, case-insensitively', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', projectId: 'acme/api' }),
      makeWorkspace({ workspaceId: 'ws_b', projectId: 'acme/web' }),
    ];
    const result = filterWorkspaces(list, { repo: 'API' });
    expect(result.map((w) => w.workspaceId)).toEqual(['ws_a']);
  });

  it('filters by repo against the persisted lock-scope repo path', () => {
    const list = [
      makeWorkspace({
        workspaceId: 'ws_a',
        projectId: 'p1',
        metadata: { lockScope: { repo: '/home/me/projects/payments' } },
      }),
      makeWorkspace({ workspaceId: 'ws_b', projectId: 'p2' }),
    ];
    const result = filterWorkspaces(list, { repo: 'payments' });
    expect(result.map((w) => w.workspaceId)).toEqual(['ws_a']);
  });

  it('filters by agent (runtimeId) substring', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', runtimeId: 'claude_code' }),
      makeWorkspace({ workspaceId: 'ws_b', runtimeId: 'codex' }),
      makeWorkspace({ workspaceId: 'ws_c', runtimeId: 'openfang' }),
    ];
    expect(filterWorkspaces(list, { agent: 'codex' }).map((w) => w.workspaceId)).toEqual(['ws_b']);
    expect(filterWorkspaces(list, { agent: 'claude' }).map((w) => w.workspaceId)).toEqual(['ws_a']);
  });

  it('filters by exact state', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', state: 'running' }),
      makeWorkspace({ workspaceId: 'ws_b', state: 'awaiting_review' }),
      makeWorkspace({ workspaceId: 'ws_c', state: 'running' }),
    ];
    expect(filterWorkspaces(list, { state: 'awaiting_review' }).map((w) => w.workspaceId)).toEqual([
      'ws_b',
    ]);
  });

  it('archived tri-state: true → only archived, false → only non-archived, undefined → both', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_live', state: 'running' }),
      makeWorkspace({
        workspaceId: 'ws_gone',
        state: 'archived',
        archivedAt: '2026-07-02T00:00:00.000Z',
      }),
    ];
    expect(filterWorkspaces(list, { archived: true }).map((w) => w.workspaceId)).toEqual(['ws_gone']);
    expect(filterWorkspaces(list, { archived: false }).map((w) => w.workspaceId)).toEqual(['ws_live']);
    expect(filterWorkspaces(list, {}).map((w) => w.workspaceId)).toEqual(['ws_live', 'ws_gone']);
  });

  it('free-text q matches the branch, task id, and goal/prompt fields', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', branch: 'feat/login', metadata: { prompt: 'Add SSO login' } }),
      makeWorkspace({ workspaceId: 'ws_b', branch: 'fix/cache', taskId: 'task_cache_evict' }),
    ];
    expect(filterWorkspaces(list, { q: 'login' }).map((w) => w.workspaceId)).toEqual(['ws_a']);
    expect(filterWorkspaces(list, { q: 'SSO' }).map((w) => w.workspaceId)).toEqual(['ws_a']);
    expect(filterWorkspaces(list, { q: 'cache_evict' }).map((w) => w.workspaceId)).toEqual(['ws_b']);
  });

  it('free-text q matches the friendly codename the board shows', () => {
    const ws = makeWorkspace({ workspaceId: 'ws_ea6c7cc1' });
    const codename = workspaceCodename('ws_ea6c7cc1');
    const firstWord = codename.split('-')[0];
    const result = filterWorkspaces([ws, makeWorkspace({ workspaceId: 'ws_other' })], { q: firstWord });
    expect(result).toContain(ws);
  });

  it('ANDs filters together (repo AND agent AND state)', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', projectId: 'acme/api', runtimeId: 'codex', state: 'running' }),
      makeWorkspace({ workspaceId: 'ws_b', projectId: 'acme/api', runtimeId: 'codex', state: 'merged' }),
      makeWorkspace({ workspaceId: 'ws_c', projectId: 'acme/web', runtimeId: 'codex', state: 'running' }),
    ];
    const result = filterWorkspaces(list, { repo: 'acme/api', agent: 'codex', state: 'running' });
    expect(result.map((w) => w.workspaceId)).toEqual(['ws_a']);
  });

  it('returns a truthful EMPTY list when nothing matches (never broadened)', () => {
    const list = [makeWorkspace({ workspaceId: 'ws_a', projectId: 'acme/api' })];
    expect(filterWorkspaces(list, { q: 'nonexistent-xyz' })).toEqual([]);
    expect(filterWorkspaces(list, { repo: 'no-such-repo' })).toEqual([]);
    expect(filterWorkspaces([], { q: 'anything' })).toEqual([]);
  });

  it('an empty filter set returns every record, order preserved, without mutating input', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a' }),
      makeWorkspace({ workspaceId: 'ws_b' }),
    ];
    const snapshot = list.map((w) => w.workspaceId);
    const result = filterWorkspaces(list, {});
    expect(result.map((w) => w.workspaceId)).toEqual(['ws_a', 'ws_b']);
    expect(result).not.toBe(list);
    expect(list.map((w) => w.workspaceId)).toEqual(snapshot);
  });
});

describe('matchesWorkspaceFilters', () => {
  it('an all-empty filter matches every workspace', () => {
    expect(matchesWorkspaceFilters(makeWorkspace(), {})).toBe(true);
  });

  it('a state=archived filter with archived=false is an honest no-match (contradiction)', () => {
    const ws = makeWorkspace({ state: 'archived', archivedAt: '2026-07-02T00:00:00.000Z' });
    expect(matchesWorkspaceFilters(ws, { state: 'archived', archived: false })).toBe(false);
  });
});

describe('sortByRecencyDesc', () => {
  it('orders archived history most-recent-first by archivedAt', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_old', archivedAt: '2026-07-01T00:00:00.000Z' }),
      makeWorkspace({ workspaceId: 'ws_new', archivedAt: '2026-07-05T00:00:00.000Z' }),
      makeWorkspace({ workspaceId: 'ws_mid', archivedAt: '2026-07-03T00:00:00.000Z' }),
    ];
    expect(sortByRecencyDesc(list).map((w) => w.workspaceId)).toEqual(['ws_new', 'ws_mid', 'ws_old']);
  });

  it('falls back to updatedAt when archivedAt is absent, and does not mutate input', () => {
    const list = [
      makeWorkspace({ workspaceId: 'ws_a', updatedAt: '2026-07-01T00:00:00.000Z' }),
      makeWorkspace({ workspaceId: 'ws_b', updatedAt: '2026-07-09T00:00:00.000Z' }),
    ];
    const snapshot = list.map((w) => w.workspaceId);
    expect(sortByRecencyDesc(list).map((w) => w.workspaceId)).toEqual(['ws_b', 'ws_a']);
    expect(list.map((w) => w.workspaceId)).toEqual(snapshot);
  });
});

describe('parseArchivedParam', () => {
  it('parses truthy/falsy string forms and ignores the rest', () => {
    expect(parseArchivedParam('true')).toBe(true);
    expect(parseArchivedParam('1')).toBe(true);
    expect(parseArchivedParam('yes')).toBe(true);
    expect(parseArchivedParam('false')).toBe(false);
    expect(parseArchivedParam('0')).toBe(false);
    expect(parseArchivedParam('no')).toBe(false);
    expect(parseArchivedParam(undefined)).toBeUndefined();
    expect(parseArchivedParam('maybe')).toBeUndefined();
    expect(parseArchivedParam(['true'])).toBe(true);
  });
});
