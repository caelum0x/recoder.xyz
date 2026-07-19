/**
 * Unit tests for parallelRunGroups / taskGroupOf — proves the board derives
 * multi-agent compare groups (F3) from real workspace metadata and NEVER invents
 * a group: only a taskGroup shared by ≥2 siblings is surfaced.
 */
import { describe, expect, it } from 'vitest';
import { parallelRunGroups, taskGroupOf } from './compare-groups';
import type { Workspace } from '../types';

function ws(over: Partial<Workspace> & { metadata?: Record<string, unknown> }): Workspace {
  return {
    workspaceId: over.workspaceId || 'w',
    spaceId: 's',
    projectId: over.projectId || 'p',
    taskId: over.taskId || 't',
    runtimeId: over.runtimeId || 'claude',
    substrate: 'tmux_worktree',
    branch: over.branch || 'b',
    baseRef: 'main',
    state: over.state || 'running',
    createdBy: 'op',
    createdAt: over.createdAt || '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt || '2026-01-01T00:00:00Z',
    metadata: over.metadata,
    ...over,
  };
}

describe('taskGroupOf', () => {
  it('reads a non-blank metadata.taskGroup, else undefined', () => {
    expect(taskGroupOf(ws({ metadata: { taskGroup: 'grp_1' } }))).toBe('grp_1');
    expect(taskGroupOf(ws({ metadata: { taskGroup: '  ' } }))).toBeUndefined();
    expect(taskGroupOf(ws({ metadata: {} }))).toBeUndefined();
    expect(taskGroupOf(ws({}))).toBeUndefined();
  });
});

describe('parallelRunGroups', () => {
  it('returns no groups for an empty list', () => {
    expect(parallelRunGroups([])).toEqual([]);
  });

  it('surfaces a group only when ≥2 siblings share a taskGroup', () => {
    const groups = parallelRunGroups([
      ws({ workspaceId: 'a', runtimeId: 'claude', metadata: { taskGroup: 'grp_1', prompt: 'Add auth' } }),
      ws({ workspaceId: 'b', runtimeId: 'codex', metadata: { taskGroup: 'grp_1', prompt: 'Add auth' } }),
      // A solo run — has a taskGroup of one, must NOT be surfaced.
      ws({ workspaceId: 'c', runtimeId: 'opencode', metadata: { taskGroup: 'grp_solo' } }),
      // Ungrouped — never surfaced.
      ws({ workspaceId: 'd', runtimeId: 'claude' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].taskGroup).toBe('grp_1');
    expect(groups[0].count).toBe(2);
    expect(groups[0].goal).toBe('Add auth');
    expect(groups[0].agents.sort()).toEqual(['claude', 'codex']);
    expect(groups[0].workspaces.map((w) => w.workspaceId)).toEqual(['a', 'b']);
  });

  it('orders siblings oldest-first, stable by workspaceId', () => {
    const groups = parallelRunGroups([
      ws({ workspaceId: 'z', metadata: { taskGroup: 'g' }, createdAt: '2026-02-01T00:00:00Z' }),
      ws({ workspaceId: 'a', metadata: { taskGroup: 'g' }, createdAt: '2026-01-01T00:00:00Z' }),
      ws({ workspaceId: 'm', metadata: { taskGroup: 'g' }, createdAt: '2026-01-01T00:00:00Z' }),
    ]);
    expect(groups[0].workspaces.map((w) => w.workspaceId)).toEqual(['a', 'm', 'z']);
  });

  it('dedupes agents while preserving sibling order', () => {
    const groups = parallelRunGroups([
      ws({ workspaceId: 'a', runtimeId: 'claude', metadata: { taskGroup: 'g' }, createdAt: '2026-01-01T00:00:00Z' }),
      ws({ workspaceId: 'b', runtimeId: 'claude', metadata: { taskGroup: 'g' }, createdAt: '2026-01-02T00:00:00Z' }),
      ws({ workspaceId: 'c', runtimeId: 'codex', metadata: { taskGroup: 'g' }, createdAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(groups[0].agents).toEqual(['claude', 'codex']);
    expect(groups[0].count).toBe(3);
  });

  it('sorts multiple groups by their newest sibling first', () => {
    const groups = parallelRunGroups([
      ws({ workspaceId: 'a1', metadata: { taskGroup: 'old' }, updatedAt: '2026-01-01T00:00:00Z' }),
      ws({ workspaceId: 'a2', metadata: { taskGroup: 'old' }, updatedAt: '2026-01-02T00:00:00Z' }),
      ws({ workspaceId: 'b1', metadata: { taskGroup: 'new' }, updatedAt: '2026-06-01T00:00:00Z' }),
      ws({ workspaceId: 'b2', metadata: { taskGroup: 'new' }, updatedAt: '2026-06-02T00:00:00Z' }),
    ]);
    expect(groups.map((g) => g.taskGroup)).toEqual(['new', 'old']);
  });

  it('falls back to the codename goal when no prompt was captured', () => {
    const groups = parallelRunGroups([
      ws({ workspaceId: 'ws_abc', metadata: { taskGroup: 'g' } }),
      ws({ workspaceId: 'ws_def', metadata: { taskGroup: 'g' } }),
    ]);
    // No prompt → a stable friendly codename, never the raw id/branch.
    expect(groups[0].goal).not.toBe('');
    expect(groups[0].goal).not.toContain('ws_');
  });
});
