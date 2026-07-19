// @vitest-environment jsdom
/**
 * CheckpointsPanel — the workspace git-snapshot surface.
 *
 * Contracts under test (real component + real api client; only `fetch` and the
 * window config seam are doubled — nothing in the cockpit is stubbed):
 *
 *  1. Checkpoints for the workspace are fetched from
 *     GET /workspaces/:id/checkpoints and rendered with Restore / Branch actions.
 *  2. "Checkpoint now" POSTs to /workspaces/:id/checkpoints then refetches.
 *  3. Restore POSTs to …/:cid/restore and surfaces the safety-snapshot ref
 *     (never a silent overwrite).
 *  4. Branch POSTs to …/:cid/branch and reports the NEW workspace.
 *  5. A backend failure on an action reverts to the real error message.
 *  6. No checkpoints → an explicit truthful empty state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { CheckpointsPanel } from './CheckpointsPanel';
import type { Checkpoint, Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-cp',
    spaceId: 'default',
    projectId: 'default',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    state: 'running',
    createdBy: 'op',
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    ...overrides,
  } as Workspace;
}

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    checkpointId: 'cp_1',
    workspaceId: 'ws-cp',
    label: 'before refactor',
    kind: 'stash',
    ref: 'recoder-checkpoint/cp_1',
    headSha: 'HEAD_AAAAAAAA',
    snapshotSha: 'SNAPBBBBBBBB',
    dirty: true,
    branch: 'feature/x',
    baseRef: 'main',
    runtimeId: 'claude',
    createdBy: 'op',
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

function checkpointsList(records: Checkpoint[]): Response {
  return makeResponse({ body: { success: true, data: { checkpoints: records } } });
}

function mount(ws: Workspace, onChanged: () => void = () => undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<CheckpointsPanel workspace={ws} onChanged={onChanged} />, c);
  });
  return c;
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function clickButtonByText(c: HTMLDivElement, text: string): void {
  const btn = Array.from(c.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.click();
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

describe('CheckpointsPanel', () => {
  it('lists checkpoints for the workspace with Restore/Branch actions', async () => {
    const fetchMock = vi.fn(async (_url: string) => checkpointsList([checkpoint()]));
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount(workspace());
    await flush(10);

    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/conductor/workspaces/ws-cp/checkpoints'),
    );
    expect(listCall).toBeTruthy();

    const row = c.querySelector('.checkpoint-row');
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain('before refactor');
    expect(row?.textContent).toContain('stash');
    const labels = Array.from(row!.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Restore', 'Branch']);
  });

  it('"Checkpoint now" POSTs to the create edge then refetches', async () => {
    let created = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/checkpoints') && init?.method === 'POST') {
        created = true;
        return makeResponse({ body: { success: true, data: { checkpoint: checkpoint() } } });
      }
      return checkpointsList(created ? [checkpoint()] : []);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    const onChanged = vi.fn();

    const c = mount(workspace(), onChanged);
    await flush(10);
    clickButtonByText(c, 'Checkpoint now');
    await flush(10);

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/checkpoints') && (init as RequestInit)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });

  it('Restore POSTs and surfaces the safety-snapshot ref', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/restore') && init?.method === 'POST') {
        return makeResponse({
          body: {
            success: true,
            data: { restore: { workspaceId: 'ws-cp', checkpointId: 'cp_1', restoredTo: 'SNAPBBBBBBBB', safetyRef: 'recoder-checkpoint-pre-restore/z' } },
          },
        });
      }
      return checkpointsList([checkpoint()]);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount(workspace());
    await flush(10);
    clickButtonByText(c, 'Restore');
    await flush(10);

    const restoreCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/checkpoints/cp_1/restore'));
    expect(restoreCall).toBeTruthy();
    expect(c.querySelector('.checkpoint-row-note')?.textContent).toContain(
      'recoder-checkpoint-pre-restore/z',
    );
  });

  it('Branch POSTs and reports the new workspace', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/branch') && init?.method === 'POST') {
        return makeResponse({
          body: {
            success: true,
            data: { workspace: { checkpointId: 'cp_1', sourceWorkspaceId: 'ws-cp', workspace: { ...workspace(), workspaceId: 'ws-new-123' } } },
          },
        });
      }
      return checkpointsList([checkpoint()]);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount(workspace());
    await flush(10);
    clickButtonByText(c, 'Branch');
    await flush(10);

    const branchCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/checkpoints/cp_1/branch'));
    expect(branchCall).toBeTruthy();
    expect(c.querySelector('.checkpoint-row-note')?.textContent).toContain('ws-new-1');
  });

  it('reverts to the real error message when a restore fails', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/restore') && init?.method === 'POST') {
        return makeResponse({ status: 503, ok: false, body: { success: false, error: 'no worktree' } });
      }
      return checkpointsList([checkpoint()]);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount(workspace());
    await flush(10);
    clickButtonByText(c, 'Restore');
    await flush(10);

    expect(c.querySelector('.checkpoint-row-error')?.textContent).toContain('no worktree');
  });

  it('shows a truthful empty state when there are no checkpoints', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => checkpointsList([]));
    const c = mount(workspace());
    await flush(10);
    expect(c.querySelector('.checkpoints-note')?.textContent).toContain('No checkpoints yet');
  });
});
