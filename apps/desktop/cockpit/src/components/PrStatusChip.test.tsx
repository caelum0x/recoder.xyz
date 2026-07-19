// @vitest-environment jsdom
/**
 * PrStatusChip — the inline PR + checks status chip.
 *
 * Contracts under test (real component + real api client; only `fetch` and the
 * window config seam are doubled — nothing in the cockpit is stubbed):
 *
 *  1. It fetches GET /workspaces/:id/pr-status.
 *  2. An open PR with passing checks renders "PR #NN" + "checks passing".
 *  3. Failing checks render the worst-wins failing rollup + a conflicts badge.
 *  4. `available:false` (gh could not be consulted) is a truthful "unavailable"
 *     line with the reason — never a fabricated PR / green check.
 *  5. `available:true, hasPr:false` is a truthful "No PR yet" line.
 *  6. A transport failure surfaces the real error, not a fake state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PrStatusChip } from './PrStatusChip';
import type { PrStatusView, Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-pr',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'op',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  } as Workspace;
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

function statusResponse(view: PrStatusView): Response {
  return makeResponse({ body: { success: true, data: view } });
}

function mount(ws: Workspace): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<PrStatusChip workspace={ws} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 't' },
  };
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

describe('PrStatusChip', () => {
  it('fetches the pr-status edge for the workspace', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      statusResponse({ available: true, hasPr: false, reason: 'no pull request for branch' }),
    );
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    mount(workspace());
    await flush(10);

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/conductor/workspaces/ws-pr/pr-status'),
    );
    expect(call).toBeTruthy();
  });

  it('renders an open PR with passing checks', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      statusResponse({
        available: true,
        hasPr: true,
        number: 42,
        state: 'open',
        mergeable: 'mergeable',
        url: 'https://github.com/o/r/pull/42',
        checks: { total: 3, passed: 3, failed: 0, pending: 0, rollup: 'passing' },
      }),
    );

    const c = mount(workspace());
    await flush(10);

    expect(c.textContent).toContain('PR #42');
    expect(c.textContent).toContain('checks passing (3)');
    const link = c.querySelector('.pr-status-link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('https://github.com/o/r/pull/42');
  });

  it('renders failing checks + a conflicts badge (worst-wins, truthful)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      statusResponse({
        available: true,
        hasPr: true,
        number: 7,
        state: 'open',
        mergeable: 'conflicting',
        checks: { total: 4, passed: 3, failed: 1, pending: 0, rollup: 'failing' },
      }),
    );

    const c = mount(workspace());
    await flush(10);

    expect(c.textContent).toContain('checks failing (1/4)');
    expect(c.textContent).toContain('conflicts');
  });

  it('shows a truthful unavailable line when gh could not be consulted', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      statusResponse({ available: false, hasPr: false, reason: 'gh CLI not found' }),
    );

    const c = mount(workspace());
    await flush(10);

    expect(c.querySelector('.pr-status-unavailable')?.textContent).toContain('gh CLI not found');
    expect(c.textContent).not.toContain('PR #');
  });

  it('shows a truthful "No PR yet" line when the branch has no PR', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      statusResponse({ available: true, hasPr: false, reason: 'no pull request for branch' }),
    );

    const c = mount(workspace());
    await flush(10);

    expect(c.querySelector('.pr-status-none')?.textContent).toContain('No PR yet');
  });

  it('surfaces a transport failure instead of faking a state', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      makeResponse({ status: 404, ok: false, body: { success: false, error: 'workspace not found' } }),
    );

    const c = mount(workspace());
    await flush(10);

    expect(c.querySelector('.pr-status-unavailable')?.textContent).toContain('workspace not found');
  });
});
