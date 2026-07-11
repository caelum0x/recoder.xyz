// @vitest-environment jsdom
/**
 * NetworkingPanel — unit tests.
 *
 * Drives the production <NetworkingPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching GatewayPanel.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders mesh health from GET /api/ziti/health + identities from /api/ziti/identities.
 *  2. Degrade-safe: when /api/ziti/health reports available=false, renders truthful
 *     "mesh unavailable" banner without fabricating identity data.
 *  3. Degrade-safe: when the backend is unreachable, renders backend-unreachable
 *     banner without fabricating mesh data.
 *  4. Registry entry exists with id "networking".
 *  5. Panel loads via dynamic import from registry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { NetworkingPanel } from './NetworkingPanel';
import type { ZitiHealth, ZitiIdentityList } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<NetworkingPanel />, c);
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

const fakeHealth: ZitiHealth = {
  available: true,
  configured: true,
  controllerUrl: 'https://ziti-controller.example.com:1280',
};

const fakeIdentities: ZitiIdentityList = {
  available: true,
  identities: [
    { id: 'id-001', name: 'runner-dev-1', isAdmin: false },
    { id: 'id-002', name: 'admin-agent', isAdmin: true, enrollmentJwt: 'jwt-abc123' },
  ],
};

const unavailableHealth: ZitiHealth = {
  available: false,
  configured: false,
  reason: 'Set ZITI_CONTROLLER_URL and ZITI_API_TOKEN (or ZITI_ADMIN_USERNAME/PASSWORD)',
};

const unavailableIdentities: ZitiIdentityList = {
  available: false,
  identities: [],
  reason: 'Ziti not configured',
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

describe('NetworkingPanel', () => {
  it('renders mesh health and identities when /api/ziti returns data', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/ziti/health')) {
        return makeResponse({ body: { success: true, data: fakeHealth } });
      }
      if (typeof url === 'string' && url.includes('/api/ziti/identities')) {
        return makeResponse({ body: { success: true, data: fakeIdentities } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Networking');
    expect(c.textContent).toContain('Mesh available');
    expect(c.textContent).toContain('ziti-controller.example.com');
    expect(c.textContent).toContain('runner-dev-1');
    expect(c.textContent).toContain('admin-agent');
  });

  it('renders degrade-safe unavailable banner when health reports unavailable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/ziti/health')) {
        return makeResponse({ body: { success: true, data: unavailableHealth } });
      }
      if (typeof url === 'string' && url.includes('/api/ziti/identities')) {
        return makeResponse({ body: { success: true, data: unavailableIdentities } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Zero-trust mesh unavailable');
    expect(c.textContent).toContain('ZITI_CONTROLLER_URL');
    // Must not show fake "Mesh available"
    expect(c.textContent).not.toContain('Mesh available');
    // Must not render identities section when mesh is down
    expect(c.querySelector('.networking-identities-section')).toBeNull();
  });

  it('renders degrade-safe banner when /api/ziti/health returns 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/ziti')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: { success: false, error: 'Ziti controller unreachable' },
        });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Networking');
    // Should show unavailable banner (503 triggers mesh unavailable state)
    expect(c.querySelector('.banner-warn')).not.toBeNull();
    // No fabricated mesh health strip
    expect(c.querySelector('.networking-health-section')).toBeNull();
  });

  it('renders degrade-safe backend-unreachable banner when fetch throws', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Networking surface unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated data sections
    expect(c.querySelector('.networking-health-section')).toBeNull();
    expect(c.querySelector('.networking-identities-section')).toBeNull();
  });

  it('registry entry exists with id "networking"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'networking');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Networking');
    expect(entry?.capability).toBe('ziti-zero-trust-mesh');
    expect(entry?.primary).toBe(false);
    expect(entry?.healthKey).toBeNull();
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'networking');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
