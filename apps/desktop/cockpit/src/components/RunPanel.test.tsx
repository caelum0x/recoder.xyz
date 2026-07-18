// @vitest-environment jsdom
/**
 * RunPanel — unit tests.
 *
 * Drives the production <RunPanel/> Preact tree in a real jsdom DOM with only
 * `fetch` / `window` doubled, matching RetrievalPanel.test.tsx conventions.
 *
 * Verified behavior:
 *  1. The run command box prefills with the workspace's detected dev command.
 *  2. Switching workspaces re-prefills with the NEW workspace's detected
 *     command — the previous workspace's command is not left in the box (which
 *     would launch the wrong command in the new worktree). Regression guard for
 *     the workspace-switch reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { RunPanel } from './RunPanel';
import type { Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-a',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    worktreePath: '/tmp/wt/ws-a',
    state: 'running',
    createdBy: 'op',
    createdAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-06-29T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

/** Per-workspace detected dev command, keyed by the id embedded in the URL. */
const DEV_COMMANDS: Record<string, { command: string; label: string }> = {
  'ws-a': { command: 'pnpm run dev', label: 'pnpm run dev' },
  'ws-b': { command: 'cargo run', label: 'cargo run' },
};

function mount(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<RunPanel workspace={ws} />, c);
  });
  return c;
}

function rerender(c: HTMLDivElement, ws: Workspace): void {
  act(() => {
    render(<RunPanel workspace={ws} />, c);
  });
}

async function flush(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 'test-token' },
  };
  (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
    if (typeof url === 'string' && url.includes('/dev-command')) {
      const match = Object.keys(DEV_COMMANDS).find((id) => url.includes(id));
      const dev = match ? DEV_COMMANDS[match] : null;
      return makeResponse({ body: { success: true, data: dev } });
    }
    return makeResponse({ body: { success: true, data: {} } });
  });
});

afterEach(() => {
  if (container) {
    act(() => {
      render(null, container as HTMLDivElement);
    });
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('RunPanel', () => {
  it("prefills the command box with the workspace's detected dev command", async () => {
    const c = mount(workspace({ workspaceId: 'ws-a', worktreePath: '/tmp/wt/ws-a' }));
    await flush();

    const input = c.querySelector('.run-panel-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe('pnpm run dev');
  });

  it('re-prefills with the new workspace command after switching workspaces', async () => {
    const c = mount(workspace({ workspaceId: 'ws-a', worktreePath: '/tmp/wt/ws-a' }));
    await flush();

    let input = c.querySelector('.run-panel-input') as HTMLInputElement | null;
    expect(input?.value).toBe('pnpm run dev');

    rerender(c, workspace({ workspaceId: 'ws-b', worktreePath: '/tmp/wt/ws-b' }));
    await flush();

    input = c.querySelector('.run-panel-input') as HTMLInputElement | null;
    // The box must reflect B's command, NOT the stale 'pnpm run dev' from A —
    // otherwise Start Run launches A's command in B's worktree.
    expect(input?.value).toBe('cargo run');
  });

  it('keeps a user-typed command instead of overwriting it with detection', async () => {
    const c = mount(workspace({ workspaceId: 'ws-a', worktreePath: '/tmp/wt/ws-a' }));
    await flush();

    const input = c.querySelector('.run-panel-input') as HTMLInputElement;
    expect(input.value).toBe('pnpm run dev');

    input.value = 'pnpm run start';
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const after = c.querySelector('.run-panel-input') as HTMLInputElement | null;
    expect(after?.value).toBe('pnpm run start');
  });
});
