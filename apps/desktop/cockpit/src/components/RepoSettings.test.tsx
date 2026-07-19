// @vitest-environment jsdom
/**
 * RepoSettings — the per-repo setup-script pane (behind the avatar settings).
 *
 * Contracts under test (real component + real api client; only `fetch` and the
 * window config seam are doubled — nothing in the cockpit is stubbed):
 *
 *  1. On open it loads the selected repo's script from GET /repo-setup-script
 *     (keyed by the SAME repoKey the backend uses) and fills the textarea.
 *  2. Save PUTs /repo-setup-script with { repoKey, script } and reports success.
 *  3. A governance deny (403) surfaces "Blocked by the governance gate" — never
 *     a faked success.
 *  4. Saving an empty script reports it was CLEARED (an empty script is legal).
 *  5. No workspaces → an explicit truthful empty state (no picker, no PUT).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { RepoSettings } from './RepoSettings';
import type { RepoSetupConfig, Workspace } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-1',
    spaceId: 'default',
    projectId: 'proj-1',
    taskId: 'task_1',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feature/x',
    baseRef: 'main',
    state: 'running',
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

function configResponse(config: RepoSetupConfig | null): Response {
  return makeResponse({ body: { success: true, data: { config } } });
}

function mount(workspaces: Workspace[], onClose: () => void = () => undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<RepoSettings workspaces={workspaces} onClose={onClose} />, c);
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

function setTextarea(c: HTMLDivElement, value: string): void {
  const ta = c.querySelector('textarea') as HTMLTextAreaElement;
  ta.value = value;
  act(() => {
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const CONFIG: RepoSetupConfig = {
  repoKey: 'proj-1',
  script: 'pnpm install',
  updatedBy: 'user_1',
  updatedAt: '2026-07-10T00:00:00Z',
};

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

describe('RepoSettings', () => {
  it('loads the selected repo script (keyed by the backend repoKey) into the textarea', async () => {
    const fetchMock = vi.fn(async (_url: string) => configResponse(CONFIG));
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount([workspace()]);
    await flush(10);

    const getCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/conductor/repo-setup-script?repoKey=proj-1'),
    );
    expect(getCall).toBeTruthy();
    expect((c.querySelector('textarea') as HTMLTextAreaElement).value).toBe('pnpm install');
    expect(c.querySelector('.repo-settings-meta')?.textContent).toContain('user_1');
  });

  it('PUTs the script on Save and reports success', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return makeResponse({
          body: { success: true, data: { config: { ...CONFIG, script: 'pnpm i && pnpm build' } } },
        });
      }
      return configResponse(CONFIG);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount([workspace()]);
    await flush(10);
    setTextarea(c, 'pnpm i && pnpm build');
    clickButtonByText(c, 'Save');
    await flush(10);

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/conductor/repo-setup-script') &&
        (init as RequestInit)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).toEqual({ repoKey: 'proj-1', script: 'pnpm i && pnpm build' });
    expect(c.querySelector('.form-note')?.textContent).toContain('Setup script saved');
  });

  it('surfaces a governance deny (403) truthfully — never a faked success', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return makeResponse({
          status: 403,
          ok: false,
          body: { success: false, error: 'blocked by governance gate' },
        });
      }
      return configResponse(CONFIG);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount([workspace()]);
    await flush(10);
    clickButtonByText(c, 'Save');
    await flush(10);

    expect(c.querySelector('.form-error')?.textContent).toContain('Blocked by the governance gate');
    expect(c.querySelector('.form-note')).toBeNull();
  });

  it('reports a cleared script when saving an empty value', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return makeResponse({
          body: { success: true, data: { config: { ...CONFIG, script: '' } } },
        });
      }
      return configResponse(CONFIG);
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount([workspace()]);
    await flush(10);
    setTextarea(c, '');
    clickButtonByText(c, 'Save');
    await flush(10);

    expect(c.querySelector('.form-note')?.textContent).toContain('Setup script cleared');
  });

  it('shows a truthful empty state (no picker, no fetch) when there are no repos', async () => {
    const fetchMock = vi.fn(async () => configResponse(null));
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount([]);
    await flush(10);

    expect(c.querySelector('.repo-settings-empty')?.textContent).toContain('No repos yet');
    expect(c.querySelector('select')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
