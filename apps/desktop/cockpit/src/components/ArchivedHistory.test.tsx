// @vitest-environment jsdom
/**
 * ArchivedHistory — the board's "Archived" history view. Presentational: renders
 * archived workspaces most-recent-first, with truthful loading/error/empty states
 * and no fabricated rows. Driven by plain props for deterministic assertions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ArchivedHistory } from './ArchivedHistory';
import { workspaceCodename } from '../lib/workspace-codename';
import type { Workspace } from '../types';

let container: HTMLDivElement | null = null;

function ws(overrides: Partial<Workspace>): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 's',
    projectId: 'acme/api',
    taskId: 't',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feat/x',
    baseRef: 'main',
    state: 'archived',
    createdBy: 'u',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    archivedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function mount(props: Parameters<typeof ArchivedHistory>[0]): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<ArchivedHistory {...props} />, c);
  });
  return c;
}

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
    container = null;
  }
});

describe('ArchivedHistory', () => {
  it('shows a loading line while first fetch is in flight', () => {
    const c = mount({ workspaces: [], loading: true, error: null, selectedId: null, onSelect: () => {} });
    expect(c.querySelector('.archived-history-empty')?.textContent).toContain('Loading');
  });

  it('surfaces a truthful error message', () => {
    const c = mount({
      workspaces: [],
      loading: false,
      error: new Error('backend down'),
      selectedId: null,
      onSelect: () => {},
    });
    expect(c.querySelector('.archived-history-error')?.textContent).toContain('backend down');
  });

  it('shows an honest empty state (no fabricated rows)', () => {
    const c = mount({ workspaces: [], loading: false, error: null, selectedId: null, onSelect: () => {} });
    expect(c.querySelector('.archived-history-empty')?.textContent).toBe('No archived workspaces.');
    expect(c.querySelector('.archived-row')).toBeNull();
  });

  it('renders rows most-recent-first by archivedAt', () => {
    const c = mount({
      workspaces: [
        ws({ workspaceId: 'ws_old', archivedAt: '2026-07-01T00:00:00.000Z' }),
        ws({ workspaceId: 'ws_new', archivedAt: '2026-07-05T00:00:00.000Z' }),
      ],
      loading: false,
      error: null,
      selectedId: null,
      onSelect: () => {},
    });
    // No prompt → the goal label IS the friendly codename; assert their order.
    const labels = Array.from(c.querySelectorAll('.archived-row-goal')).map((e) => e.textContent);
    expect(labels).toEqual([workspaceCodename('ws_new'), workspaceCodename('ws_old')]);
  });

  it('renders the goal as the primary label with the codename demoted', () => {
    const c = mount({
      workspaces: [ws({ workspaceId: 'ws_1', metadata: { prompt: 'add SSO login' } })],
      loading: false,
      error: null,
      selectedId: null,
      onSelect: () => {},
    });
    expect(c.querySelector('.archived-row-goal')?.textContent).toBe('add SSO login');
    expect(c.querySelector('.archived-row-codename')?.textContent).toBe(workspaceCodename('ws_1'));
  });

  it('invokes onSelect with the workspace id when a row is clicked', () => {
    const onSelect = vi.fn();
    const c = mount({
      workspaces: [ws({ workspaceId: 'ws_42' })],
      loading: false,
      error: null,
      selectedId: null,
      onSelect,
    });
    act(() => {
      (c.querySelector('.archived-row') as HTMLButtonElement).click();
    });
    expect(onSelect).toHaveBeenCalledWith('ws_42');
  });

  it('marks the selected row', () => {
    const c = mount({
      workspaces: [ws({ workspaceId: 'ws_1' }), ws({ workspaceId: 'ws_2' })],
      loading: false,
      error: null,
      selectedId: 'ws_2',
      onSelect: () => {},
    });
    const selected = c.querySelector('.archived-row-selected');
    expect(selected).not.toBeNull();
  });
});
