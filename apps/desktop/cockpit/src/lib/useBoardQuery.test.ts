// @vitest-environment jsdom
/**
 * useBoardQuery — the board's debounced, server-authoritative search feed. It
 * hits `api.queryWorkspaces` (GET /workspaces?q=&…) ONLY when a filter is active,
 * and fetches nothing otherwise so the unfiltered board poll stays the source.
 * We mock the api module (an external seam) and drive the hook through a probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useBoardQuery } from './useBoardQuery';
import { api } from './api';
import type { PollState } from './usePoll';
import type { Workspace } from '../types';

vi.mock('./api', () => ({ api: { queryWorkspaces: vi.fn() } }));

const queryWorkspaces = api.queryWorkspaces as unknown as ReturnType<typeof vi.fn>;

let container: HTMLDivElement | null = null;
let captured: PollState<Workspace[] | null> | null = null;

function ws(id: string): Workspace {
  return {
    workspaceId: id,
    spaceId: 's',
    projectId: 'acme/api',
    taskId: 't',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'feat/x',
    baseRef: 'main',
    state: 'running',
    createdBy: 'u',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function Probe({ filters }: { filters: Record<string, unknown> }) {
  captured = useBoardQuery(filters as never, 1000);
  return h('span', null, String(captured.data ? captured.data.length : 'null'));
}

function mount(filters: Record<string, unknown>): void {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => render(h(Probe, { filters }), c));
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  queryWorkspaces.mockReset();
  queryWorkspaces.mockResolvedValue([ws('ws_a'), ws('ws_b')]);
});

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
  captured = null;
});

describe('useBoardQuery', () => {
  it('does NOT hit the query endpoint when no filter is active', async () => {
    mount({});
    await flush(60);
    expect(queryWorkspaces).not.toHaveBeenCalled();
    expect(captured?.data).toBeNull();
  });

  it('queries the endpoint with the active filters and returns the narrowed list', async () => {
    mount({ q: 'sso', repo: 'acme/api' });
    // The debounce seeds the active filter on mount, so the fetch fires promptly.
    await flush(60);
    expect(queryWorkspaces).toHaveBeenCalled();
    const arg = queryWorkspaces.mock.calls[0][0];
    expect(arg.q).toBe('sso');
    expect(arg.repo).toBe('acme/api');
    expect(captured?.data?.length).toBe(2);
  });

  it('drops empty/whitespace fields from the query', async () => {
    mount({ q: '   ', repo: 'acme/web' });
    await flush(60);
    const arg = queryWorkspaces.mock.calls[0][0];
    expect(arg.q).toBeUndefined();
    expect(arg.repo).toBe('acme/web');
  });
});
