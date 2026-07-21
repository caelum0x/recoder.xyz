// @vitest-environment jsdom
/**
 * ComparePanel — the multi-agent side-by-side of a parallel-run group (F3).
 *
 * Contracts under test (real component + real api client; only `fetch` and the
 * window config seam are doubled — nothing in the cockpit is stubbed):
 *
 *  1. Siblings are fetched from GET /workspaces/compare?taskGroup= and rendered
 *     one column per agent (agent, state, diff stat).
 *  2. A sibling with no worktree shows a truthful "diff unavailable — <reason>"
 *     line, never a fabricated 0/0/0.
 *  3. "Merge this one" POSTs to the governed /workspaces/:id/merge and reports it.
 *  4. A 409 delivery-gate rejection surfaces the awaiting-approval verdict inline
 *     (never faked success).
 *  5. Merge is disabled for a state the backend would reject (canMerge gate).
 *  6. An empty/unknown group is a truthful empty view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ComparePanel } from './ComparePanel';
import type { CompareView, SiblingCompareEntry } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function sibling(over: Partial<SiblingCompareEntry> = {}): SiblingCompareEntry {
  return {
    workspaceId: over.workspaceId || 'ws_1',
    agent: over.agent || 'claude',
    runtimeId: over.runtimeId || over.agent || 'claude',
    branch: over.branch || 'conductor/ws_1',
    state: over.state || 'awaiting_review',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    diffStat: over.diffStat === null ? undefined : over.diffStat ?? { files: 3, additions: 45, deletions: 12 },
    ...over,
  } as SiblingCompareEntry;
}

function compareView(siblings: SiblingCompareEntry[], taskGroup = 'grp_1'): CompareView {
  return { taskGroup, count: siblings.length, siblings };
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

function compareResponse(view: CompareView): Response {
  return makeResponse({ body: { success: true, data: { compare: view } } });
}

function mount(taskGroup = 'grp_1', onChanged: () => void = () => undefined): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(
      <ComparePanel taskGroup={taskGroup} goal="Add auth" onClose={() => undefined} onChanged={onChanged} />,
      c,
    );
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
  act(() => btn.click());
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 't' },
  };
});

afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLDivElement));
    container.remove();
    container = null;
  }
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('ComparePanel', () => {
  it('fetches the group and renders one column per sibling with its diff stat', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/api/conductor/workspaces/compare?taskGroup=grp_1');
      return compareResponse(
        compareView([
          sibling({ workspaceId: 'ws_a', agent: 'claude', diffStat: { files: 3, additions: 45, deletions: 12 } }),
          sibling({ workspaceId: 'ws_b', agent: 'codex', diffStat: { files: 1, additions: 5, deletions: 0 } }),
        ]),
      );
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount();
    await flush(10);

    const cols = c.querySelectorAll('.compare-col');
    expect(cols.length).toBe(2);
    expect(c.textContent).toContain('claude');
    expect(c.textContent).toContain('codex');
    expect(c.textContent).toContain('+45');
    expect(c.textContent).toContain('−12');
  });

  it('shows a truthful unavailable line for a sibling with no diff stat', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      compareResponse(
        compareView([
          sibling({
            workspaceId: 'ws_fail',
            state: 'failed',
            diffStat: null as never,
            diffStatReason: 'no worktree (launch failed)',
          }),
        ]),
      ),
    );

    const c = mount();
    await flush(10);

    const absent = c.querySelector('.compare-col-diffstat-absent');
    expect(absent?.textContent).toContain('diff unavailable');
    expect(absent?.textContent).toContain('no worktree');
  });

  it('"Merge this one" POSTs to the governed merge edge and reports it', async () => {
    let merged = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/workspaces/ws_a/merge') && init?.method === 'POST') {
        merged = true;
        return makeResponse({
          body: { success: true, data: { merge: { workspaceId: 'ws_a', branch: 'b', merged: true } } },
        });
      }
      return compareResponse(compareView([sibling({ workspaceId: 'ws_a', agent: 'claude' })]));
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    const onChanged = vi.fn();

    const c = mount('grp_1', onChanged);
    await flush(10);
    clickButtonByText(c, 'Merge this one');
    await flush(10);

    expect(merged).toBe(true);
    expect(c.querySelector('.compare-col-note')?.textContent).toContain('Merged');
    expect(onChanged).toHaveBeenCalled();
  });

  it('surfaces the awaiting-approval verdict inline on a 409 delivery gate', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/merge') && init?.method === 'POST') {
        return makeResponse({
          status: 409,
          ok: false,
          body: {
            success: false,
            error: 'merge requires approval',
            data: { state: 'awaiting_approval', action: 'merge', approvalId: 'appr_9', transitioned: true },
          },
        });
      }
      return compareResponse(compareView([sibling({ workspaceId: 'ws_a', agent: 'claude' })]));
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const c = mount();
    await flush(10);
    clickButtonByText(c, 'Merge this one');
    await flush(10);

    const gated = c.querySelector('.compare-col-gated');
    expect(gated?.textContent).toContain('Awaiting approval');
    expect(gated?.textContent).toContain('appr_9');
    // Never faked as merged.
    expect(c.querySelector('.compare-col-note')).toBeNull();
  });

  it('disables merge for a state the backend would reject', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      compareResponse(compareView([sibling({ workspaceId: 'ws_run', state: 'running' })])),
    );

    const c = mount();
    await flush(10);

    const btn = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Merge this one',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('still renders siblings and now offers the group attach action when grid is present', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      compareResponse({
        ...compareView([
          sibling({ workspaceId: 'ws_a', agent: 'claude' }),
          sibling({ workspaceId: 'ws_b', agent: 'codex' }),
        ]),
        grid: { visibleSessions: ['recoder-a', 'recoder-b'] },
      }),
    );

    const c = mount();
    await flush(10);

    expect(c.querySelectorAll('.compare-col').length).toBe(2);
    const attach = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Open all in terminal',
    );
    expect(attach).toBeTruthy();
  });

  it('is unchanged (no attach action) for a grid-less compare view', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      compareResponse(compareView([sibling({ workspaceId: 'ws_a', agent: 'claude' })])),
    );

    const c = mount();
    await flush(10);

    expect(c.querySelectorAll('.compare-col').length).toBe(1);
    const attach = Array.from(c.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Open all in terminal',
    );
    expect(attach).toBeUndefined();
  });

  it('renders a truthful empty state for an unknown group', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () =>
      compareResponse({ taskGroup: 'grp_x', count: 0, siblings: [] }),
    );

    const c = mount('grp_x');
    await flush(10);

    expect(c.querySelector('.compare-note')?.textContent).toContain('No siblings');
    expect(c.querySelector('.compare-grid')).toBeNull();
  });
});
