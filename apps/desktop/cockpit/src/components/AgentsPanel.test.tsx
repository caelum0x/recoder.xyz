// @vitest-environment jsdom
/**
 * AgentsPanel — unit tests.
 *
 * Drives the production <AgentsPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching GatewayPanel.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders agent card from GET /api/agents/openfang when daemon is up.
 *  2. Degrade-safe: when /api/agents/openfang/health returns 503, renders a
 *     truthful "daemon not running" banner; no fake agent data is shown.
 *  3. Degrade-safe: when the backend is unreachable, renders a
 *     "backend unreachable" banner without fabricating agent data.
 *  4. Registry entry exists with id "agents".
 *  5. Panel loads via dynamic import from registry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { AgentsPanel } from './AgentsPanel';
import type { OpenfangAgentCard, OpenfangHealth } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<AgentsPanel />, c);
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

const fakeHealth: OpenfangHealth = {
  agent: 'openfang',
  status: 'up',
  listenAddr: '127.0.0.1:4200',
  binPath: '/usr/local/bin/openfang',
  pid: 12345,
};

const fakeCard: OpenfangAgentCard = {
  agentId: 'openfang',
  name: 'OpenFang Autonomous Agent Engine',
  description:
    '24/7 autonomous agent engine (Rust). RunEvents route through Recoder. Task/approval/memory owned by Recoder control plane.',
  a2aBoundary: true,
  status: 'up',
  listenAddr: '127.0.0.1:4200',
};

const unavailableCard: OpenfangAgentCard = {
  agentId: 'openfang',
  name: 'OpenFang Autonomous Agent Engine',
  description:
    '24/7 autonomous agent engine (Rust). RunEvents route through Recoder. Task/approval/memory owned by Recoder control plane.',
  a2aBoundary: true,
  status: 'unavailable',
  listenAddr: null,
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

describe('AgentsPanel', () => {
  it('renders agent card when daemon is up', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/agents/openfang/health')) {
        return makeResponse({ body: { success: true, data: fakeHealth } });
      }
      if (typeof url === 'string' && url.includes('/api/agents/openfang')) {
        return makeResponse({ body: { success: true, data: fakeCard } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Agents');
    expect(c.textContent).toContain('OpenFang Autonomous Agent Engine');
    expect(c.textContent).toContain('running');
    expect(c.textContent).toContain('127.0.0.1:4200');
    expect(c.textContent).toContain('A2A boundary');
  });

  it('renders degrade-safe unavailable banner when health returns 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/agents/openfang/health')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: {
            success: false,
            error:
              'openfang daemon is not running. Build crates/openfang or set OPENFANG_BIN to enable the autonomous agent engine.',
          },
        });
      }
      if (typeof url === 'string' && url.includes('/api/agents/openfang')) {
        return makeResponse({ body: { success: true, data: unavailableCard } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('OpenFang daemon not running');
    // Must not show the "running" badge (the daemon status badge, not the banner text)
    expect(c.querySelector('.badge.tone-ok')).toBeNull();
  });

  it('renders degrade-safe banner when backend is unreachable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    expect(c.textContent).toContain('Agent surface unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated agent card
    expect(c.querySelector('.agents-card')).toBeNull();
  });

  it('renders degrade-safe state when card reports unavailable without 503', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/agents/openfang/health')) {
        return makeResponse({ body: { success: true, data: { agent: 'openfang', status: 'unavailable', reason: 'binary not found' } } });
      }
      if (typeof url === 'string' && url.includes('/api/agents/openfang')) {
        return makeResponse({ body: { success: true, data: unavailableCard } });
      }
      return makeResponse({ body: { success: true, data: {} } });
    });

    const c = mount();
    await flush();

    // Should show unavailable banner
    expect(c.textContent).toContain('OpenFang daemon not running');
  });

  it('registry entry exists with id "agents"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'agents');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Openfang');
    expect(entry?.capability).toBe('openfang-agent-engine');
    expect(entry?.primary).toBe(false);
    expect(entry?.healthKey).toBeNull();
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'agents');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
