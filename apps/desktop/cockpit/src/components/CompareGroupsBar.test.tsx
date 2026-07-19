// @vitest-environment jsdom
/**
 * CompareGroupsBar — the board's multi-agent compare entry point (F3).
 *
 * Contracts under test (real component; nothing stubbed):
 *  1. Renders NOTHING when there are no parallel-run groups (solo/ungrouped).
 *  2. Renders one "Compare N agents" chip per detected group (≥2 siblings).
 *  3. Clicking a chip invokes onCompare with the real derived group.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { CompareGroupsBar } from './CompareGroupsBar';
import type { Workspace } from '../types';

let container: HTMLDivElement | null = null;

function ws(over: Partial<Workspace> & { metadata?: Record<string, unknown> }): Workspace {
  return {
    workspaceId: over.workspaceId || 'w',
    spaceId: 's',
    projectId: 'p',
    taskId: over.taskId || 't',
    runtimeId: over.runtimeId || 'claude',
    substrate: 'tmux_worktree',
    branch: 'b',
    baseRef: 'main',
    state: 'running',
    createdBy: 'op',
    createdAt: over.createdAt || '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    metadata: over.metadata,
    ...over,
  };
}

function mount(workspaces: Workspace[], onCompare: (g: unknown) => void = () => undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<CompareGroupsBar workspaces={workspaces} onCompare={onCompare as never} />, c);
  });
  return c;
}

afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLDivElement));
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
});

describe('CompareGroupsBar', () => {
  it('renders nothing without a parallel-run group', () => {
    const c = mount([
      ws({ workspaceId: 'a' }),
      ws({ workspaceId: 'b', metadata: { taskGroup: 'solo' } }),
    ]);
    expect(c.querySelector('.compare-bar')).toBeNull();
  });

  it('renders one chip per group with the agent count', () => {
    const c = mount([
      ws({ workspaceId: 'a', runtimeId: 'claude', metadata: { taskGroup: 'g1', prompt: 'Add auth' } }),
      ws({ workspaceId: 'b', runtimeId: 'codex', metadata: { taskGroup: 'g1', prompt: 'Add auth' } }),
      ws({ workspaceId: 'c', runtimeId: 'claude', metadata: { taskGroup: 'g2' } }),
      ws({ workspaceId: 'd', runtimeId: 'opencode', metadata: { taskGroup: 'g2' } }),
    ]);
    const chips = c.querySelectorAll('.compare-bar-chip');
    expect(chips.length).toBe(2);
    expect(c.textContent).toContain('Compare 2 agents');
    expect(c.textContent).toContain('Add auth');
  });

  it('invokes onCompare with the derived group on click', () => {
    const onCompare = vi.fn();
    const c = mount(
      [
        ws({ workspaceId: 'a', runtimeId: 'claude', metadata: { taskGroup: 'g1', prompt: 'Add auth' } }),
        ws({ workspaceId: 'b', runtimeId: 'codex', metadata: { taskGroup: 'g1', prompt: 'Add auth' } }),
      ],
      onCompare,
    );
    act(() => {
      (c.querySelector('.compare-bar-chip') as HTMLButtonElement).click();
    });
    expect(onCompare).toHaveBeenCalledTimes(1);
    const group = onCompare.mock.calls[0][0] as { taskGroup: string; count: number };
    expect(group.taskGroup).toBe('g1');
    expect(group.count).toBe(2);
  });
});
