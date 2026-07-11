// @vitest-environment jsdom
/**
 * RetrievalPanel — unit tests.
 *
 * Drives the production <RetrievalPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching SquadsPanel.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders capability health status when retrieval is available.
 *  2. Degrade-safe: when /api/retrieval/health returns 503, renders a truthful
 *     "Retrieval not configured" banner; no fake results are shown.
 *  3. Degrade-safe: when the backend is unreachable, renders a
 *     "Backend unreachable" banner without fabricating data.
 *  4. Search form is disabled when retrieval is unavailable.
 *  5. Registry entry exists with id "retrieval".
 *  6. Panel loads via dynamic import from registry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { RetrievalPanel } from './RetrievalPanel';
import type { RetrievalHealth } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<RetrievalPanel />, c);
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

const availableHealth: RetrievalHealth = {
  service: 'retrieval',
  available: true,
  colbertConfigured: true,
  lanceConfigured: true,
  colbertUrl: 'http://localhost:8893',
  lanceDbPath: '/data/lance',
};

const colbertOnlyHealth: RetrievalHealth = {
  service: 'retrieval',
  available: true,
  colbertConfigured: true,
  lanceConfigured: false,
  colbertUrl: 'http://localhost:8893',
  lanceDbPath: null,
};

const unavailableHealth: RetrievalHealth = {
  service: 'retrieval',
  available: false,
  colbertConfigured: false,
  lanceConfigured: false,
  reason: 'retrieval unavailable — set COLBERT_RERANK_URL and LANCE_DB_PATH to enable RAG search',
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

describe('RetrievalPanel', () => {
  it('renders health status when retrieval is fully available', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/retrieval/health')) {
        return makeResponse({ body: { success: true, data: availableHealth } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Retrieval');
    expect(c.textContent).toContain('available');
    expect(c.textContent).toContain('colbert');
    expect(c.textContent).toContain('lance');
    // Search form should be enabled
    const input = c.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);
  });

  it('renders degrade-safe unavailable banner when health returns 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/retrieval/health')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: {
            success: false,
            data: unavailableHealth,
            error: unavailableHealth.reason,
          },
        });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Retrieval not configured');
    // Must not show any available badge
    expect(c.querySelector('.badge.tone-ok')).toBeNull();
    // Search form input should be disabled
    const input = c.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input?.disabled).toBe(true);
  });

  it('renders degrade-safe banner when backend is unreachable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Retrieval surface unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated result card
    expect(c.querySelector('.retrieval-card')).toBeNull();
  });

  it('renders degrade-safe state when health reports unavailable inline (no 503)', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/retrieval/health')) {
        return makeResponse({ body: { success: true, data: unavailableHealth } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    // available=false should trigger unavailable banner
    expect(c.textContent).toContain('Retrieval not configured');
    expect(c.querySelector('.retrieval-card')).toBeNull();
  });

  it('renders colbert-only (lance not configured) hint after search', async () => {
    const searchResult = {
      query: 'test query',
      results: [],
      colbertAvailable: true,
      lanceAvailable: false,
      totalCandidates: 0,
      rerankApplied: false,
      reason: 'ColBERT reranker is configured but LANCE_DB_PATH is not set',
    };

    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/retrieval/health')) {
        return makeResponse({ body: { success: true, data: colbertOnlyHealth } });
      }
      if (typeof url === 'string' && url.includes('/api/retrieval/search')) {
        return makeResponse({ body: { success: true, data: searchResult } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    // Panel is available (colbert configured)
    expect(c.textContent).toContain('colbert');
    const input = c.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input?.disabled).toBe(false);
  });

  it('registry entry exists with id "retrieval"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'retrieval');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Retrieval');
    expect(entry?.capability).toBe('colbert-lance-rag-search');
    expect(entry?.primary).toBe(false);
    expect(entry?.healthKey).toBeNull();
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'retrieval');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
