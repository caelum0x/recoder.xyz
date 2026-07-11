// @vitest-environment jsdom
/**
 * Board — card labeling tests.
 *
 * A workspace card must be labeled by its GOAL (the prompt persisted in
 * workspace.metadata.prompt), not the opaque branch/workspace id. The branch
 * stays visible as a secondary mono line.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Board } from './Board';
import type { Workspace } from '../types';

let container: HTMLDivElement | null = null;

function mount(workspaces: Workspace[], waits?: Record<string, string>): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<Board workspaces={workspaces} selectedId={null} onSelect={() => {}} waits={waits} />, c);
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

function ws(overrides: Partial<Workspace>): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_0a1b2c3d-4e5f',
    baseRef: 'HEAD',
    state: 'running',
    createdBy: 'u',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Workspace;
}

describe('Board card labels', () => {
  it('shows metadata.prompt as the card title with the branch demoted to secondary', () => {
    const c = mount([ws({ metadata: { prompt: 'add a HELLO.txt that says hi' } })]);
    const title = c.querySelector('.card-goal');
    expect(title?.textContent).toBe('add a HELLO.txt that says hi');
    const branch = c.querySelector('.card-branch');
    expect(branch?.textContent).toBe('recoder/ws_0a1b2c3d-4e5f');
  });

  it('falls back to the branch as the title when no prompt is recorded', () => {
    const c = mount([ws({ metadata: {} })]);
    expect(c.querySelector('.card-goal')?.textContent).toBe('recoder/ws_0a1b2c3d-4e5f');
    // No duplicate secondary line when the title IS the branch.
    expect(c.querySelector('.card-branch')).toBeNull();
  });

  it('ignores a non-string metadata.prompt (never renders [object Object])', () => {
    const c = mount([ws({ metadata: { prompt: { nested: true } as unknown as string } })]);
    expect(c.querySelector('.card-goal')?.textContent).toBe('recoder/ws_0a1b2c3d-4e5f');
  });

  it('badges a workspace blocked on input and shows the prompt', () => {
    const c = mount([ws({ workspaceId: 'ws_1', state: 'running' })], {
      ws_1: 'Do you want to allow this command?',
    });
    expect(c.querySelector('.badge-needs-input')?.textContent).toContain('needs you');
    expect(c.querySelector('.card-needs-input-msg')?.textContent).toBe('Do you want to allow this command?');
    expect(c.querySelector('.card-needs-input')).not.toBeNull();
  });

  it('no needs-input badge when the workspace is not waiting', () => {
    const c = mount([ws({ workspaceId: 'ws_1', state: 'running' })], {});
    expect(c.querySelector('.badge-needs-input')).toBeNull();
  });
});
