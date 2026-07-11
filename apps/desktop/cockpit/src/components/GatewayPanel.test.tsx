// @vitest-environment jsdom
/**
 * GatewayPanel — unit tests.
 *
 * Drives the production <GatewayPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching McpToolsPanel.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders gateway status from GET /api/gateway/health + /api/gateway/status.
 *  2. Degrade-safe: when /api/gateway returns 503, renders truthful unavailable
 *     banner; no fake status data is shown.
 *  3. Degrade-safe: when the backend is unreachable, renders backend-unreachable
 *     banner without fabricating gateway data.
 *  4. Registry entry exists with id "gateway".
 *  5. Panel loads via dynamic import from registry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { GatewayPanel } from './GatewayPanel';
import type { GatewayHealth, GatewayStatus } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<GatewayPanel />, c);
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

const fakeHealth: GatewayHealth = {
  available: true,
  mode: 'external',
  baseUrl: 'http://127.0.0.1:3778',
  listenAddr: '127.0.0.1:3778',
};

const fakeStatus: GatewayStatus = {
  gateway: 'tensorzero',
  mode: 'external',
  available: true,
  baseUrl: 'http://127.0.0.1:3778',
  listenAddr: '127.0.0.1:3778',
  binaryFound: false,
};

const unavailableHealth: GatewayHealth = {
  available: false,
  mode: 'unconfigured',
  reason: 'Set TENSORZERO_URL or build crates/tensorzero to enable the gateway',
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

describe('GatewayPanel', () => {
  it('renders gateway status when /api/gateway returns data', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/gateway/health')) {
        return makeResponse({ body: { success: true, data: fakeHealth } });
      }
      if (typeof url === 'string' && url.includes('/api/gateway/status')) {
        return makeResponse({ body: { success: true, data: fakeStatus } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Inference / Gateway');
    expect(c.textContent).toContain('external');
    expect(c.textContent).toContain('Available');
    expect(c.textContent).toContain('127.0.0.1:3778');
  });

  it('renders degrade-safe unavailable banner when health reports unavailable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/gateway/health')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: { success: false, data: unavailableHealth },
        });
      }
      if (typeof url === 'string' && url.includes('/api/gateway/status')) {
        return makeResponse({ body: { success: true, data: fakeStatus } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('TensorZero gateway not running');
    // Must not show fake "Available"
    expect(c.textContent).not.toContain('Available');
  });

  it('renders degrade-safe banner when both /api/gateway endpoints return 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/gateway')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: { success: false, error: 'Gateway binary not found' },
        });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    // Should show unavailable banner (503 triggers gateway unavailable state)
    expect(c.textContent).toContain('Gateway');
    // No fabricated status data
    expect(c.querySelector('.gateway-status-block')).toBeNull();
  });

  it('renders degrade-safe banner when backend is unreachable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Gateway surface unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated data rows
    expect(c.querySelector('.gateway-status-block')).toBeNull();
  });

  it('registry entry exists with id "gateway"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'gateway');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Gateway');
    expect(entry?.capability).toBe('tensorzero-llm-gateway');
    expect(entry?.primary).toBe(false);
    expect(entry?.healthKey).toBeNull();
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'gateway');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
