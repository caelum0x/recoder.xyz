// @vitest-environment jsdom
/**
 * SquadsPanel — unit tests.
 *
 * Drives the production <SquadsPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching AgentsPanel.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders squad list from GET /api/multica/squads when Multica is available.
 *  2. Degrade-safe: when /api/multica/status returns 503, renders a truthful
 *     "Multica not running" banner; no fake squad data is shown.
 *  3. Degrade-safe: when the backend is unreachable, renders a
 *     "Backend unreachable" banner without fabricating squad data.
 *  4. Renders "No squads found" when Multica is available but squad list is empty.
 *  5. Registry entry exists with id "squads".
 *  6. Panel loads via dynamic import from registry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { SquadsPanel } from './SquadsPanel';
import type { MulticaStatus, MulticaSquad, MulticaSquadsResult } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<SquadsPanel />, c);
  });
  return c;
}

async function flush(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function makeResponse(opts: { status?: number; ok?: boolean; body?: unknown }): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return { status, ok, text: async () => text } as unknown as Response;
}

const fakeStatus: MulticaStatus = {
  service: 'multica',
  available: true,
  mode: 'external',
  baseUrl: 'http://multica.example.com',
  listenAddr: null,
  binaryFound: false,
  env: { MULTICA_URL: true, MULTICA_BIN: false },
};

const unavailableStatus: MulticaStatus = {
  service: 'multica',
  available: false,
  mode: 'unconfigured',
  baseUrl: null,
  listenAddr: null,
  binaryFound: false,
  reason: 'no Multica server configured or spawned — set MULTICA_URL or MULTICA_BIN',
  env: { MULTICA_URL: false, MULTICA_BIN: false },
};

const fakeSquad: MulticaSquad = {
  id: 'squad-001',
  workspace_id: 'ws-abc',
  name: 'Backend Alpha Squad',
  description: 'Handles backend API tasks',
  leader_id: 'agent-001',
  member_count: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const fakeSquadsResult: MulticaSquadsResult = {
  routed: true,
  squads: [fakeSquad],
};

const emptySquadsResult: MulticaSquadsResult = {
  routed: true,
  squads: [],
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    __RECODER_COCKPIT__: { backendUrl: BACKEND_URL, token: 'test-token' },
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

describe('SquadsPanel', () => {
  it('renders squad list when Multica is available', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/multica/status')) {
        return makeResponse({ body: { success: true, data: fakeStatus } });
      }
      if (typeof url === 'string' && url.includes('/api/multica/squads')) {
        return makeResponse({ body: { success: true, data: fakeSquadsResult } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Squads');
    expect(c.textContent).toContain('Backend Alpha Squad');
    expect(c.textContent).toContain('3 members');
    expect(c.textContent).toContain('external');
    expect(c.textContent).toContain('agent-001');
  });

  it('renders degrade-safe unavailable banner when status returns 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/multica/status')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: {
            success: false,
            data: unavailableStatus,
            error: 'no Multica server configured or spawned — set MULTICA_URL or MULTICA_BIN',
          },
        });
      }
      if (typeof url === 'string' && url.includes('/api/multica/squads')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: {
            success: false,
            error: 'Multica server unavailable — squad list not available',
          },
        });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Multica not running');
    // Must not show available tone-ok badge
    expect(c.querySelector('.badge.tone-ok')).toBeNull();
    // Must not show any squad card
    expect(c.querySelector('.squads-card')).toBeNull();
  });

  it('renders degrade-safe banner when backend is unreachable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Squads surface unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated squad card
    expect(c.querySelector('.squads-card')).toBeNull();
  });

  it('renders truthful empty state when Multica is available but no squads exist', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/multica/status')) {
        return makeResponse({ body: { success: true, data: fakeStatus } });
      }
      if (typeof url === 'string' && url.includes('/api/multica/squads')) {
        return makeResponse({ body: { success: true, data: emptySquadsResult } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('No squads found');
    // No squad cards rendered
    expect(c.querySelector('.squads-card')).toBeNull();
  });

  it('renders degrade-safe state when status reports unavailable inline (no 503)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/multica/status')) {
        return makeResponse({ body: { success: true, data: unavailableStatus } });
      }
      if (typeof url === 'string' && url.includes('/api/multica/squads')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: { success: false, error: 'Multica server unavailable' },
        });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    // available=false should trigger unavailable banner
    expect(c.textContent).toContain('Multica not running');
    expect(c.querySelector('.squads-card')).toBeNull();
  });

  it('registry entry exists with id "squads"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'squads');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Squads');
    expect(entry?.capability).toBe('multica-managed-agents');
    expect(entry?.primary).toBe(false);
    expect(entry?.healthKey).toBeNull();
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'squads');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
