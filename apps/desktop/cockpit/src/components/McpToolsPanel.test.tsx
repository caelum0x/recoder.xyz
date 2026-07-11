// @vitest-environment jsdom
/**
 * McpToolsPanel — unit tests.
 *
 * Drives the production <McpToolsPanel/> Preact tree in a real jsdom DOM with
 * only `fetch` / `window` doubled, matching WorkspaceCenter.test.tsx conventions.
 *
 * Verified behaviors:
 *  1. Renders server list returned by GET /api/mcp/servers.
 *  2. Renders flat tool list returned by GET /api/mcp/tools.
 *  3. Degrade-safe: when /api/mcp returns a non-ok response, renders a truthful
 *     "unavailable — <reason>" state without showing fake data.
 *  4. Degrade-safe: when the backend is unreachable, renders the "backend
 *     unreachable" banner without fabricating server rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { McpToolsPanel } from './McpToolsPanel';
import type { McpServer, McpToolEntry } from '../types';

const BACKEND_URL = 'http://localhost:3100';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<McpToolsPanel />, c);
  });
  return c;
}

async function flush(ms = 20): Promise<void> {
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

const fakeServers: McpServer[] = [
  {
    serverId: 'recoder.github',
    kind: 'github',
    displayName: 'GitHub',
    transport: 'custom',
    enabled: true,
    toolNames: ['github.pr.create', 'github.pr.list'],
  },
  {
    serverId: 'recoder.tasks',
    kind: 'tasks',
    displayName: 'Tasks',
    transport: 'custom',
    enabled: false,
    toolNames: ['tasks.get'],
  },
];

const fakeTools: McpToolEntry[] = [
  { serverId: 'recoder.github', kind: 'github', toolName: 'github.pr.create', enabled: true },
  { serverId: 'recoder.github', kind: 'github', toolName: 'github.pr.list', enabled: true },
  { serverId: 'recoder.tasks', kind: 'tasks', toolName: 'tasks.get', enabled: false },
];

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

describe('McpToolsPanel', () => {
  it('renders server list when /api/mcp/servers returns data', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mcp/servers')) {
        return makeResponse({ body: { success: true, data: fakeServers } });
      }
      if (typeof url === 'string' && url.includes('/api/mcp/tools')) {
        return makeResponse({ body: { success: true, data: fakeTools } });
      }
      return makeResponse({ body: { success: true, data: [] } });
    });

    const c = mount();
    await flush();

    // Panel title is present
    expect(c.textContent).toContain('MCP Tools');
    // Both server ids are shown
    expect(c.textContent).toContain('recoder.github');
    expect(c.textContent).toContain('recoder.tasks');
    // Summary stats
    expect(c.textContent).toContain('2 servers');
    expect(c.textContent).toContain('3 tools');
  });

  it('renders tool list when a server is selected', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mcp/servers')) {
        return makeResponse({ body: { success: true, data: fakeServers } });
      }
      if (typeof url === 'string' && url.includes('/api/mcp/tools')) {
        return makeResponse({ body: { success: true, data: fakeTools } });
      }
      return makeResponse({ body: { success: true, data: [] } });
    });

    const c = mount();
    await flush();

    // Click the github server row to expand tools
    const serverRow = Array.from(c.querySelectorAll('.mcp-server-row')).find((el) =>
      el.textContent?.includes('recoder.github'),
    );
    expect(serverRow).toBeTruthy();

    await act(async () => {
      (serverRow as HTMLElement).click();
    });
    await flush();

    // Tool names for the selected server should now be visible
    expect(c.textContent).toContain('github.pr.create');
    expect(c.textContent).toContain('github.pr.list');
    // The tasks tool (different server) should NOT be shown yet
    expect(c.querySelector('.mcp-tool-list')?.textContent).not.toContain('tasks.get');
  });

  it('renders degrade-safe error state when /api/mcp returns an error', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/mcp')) {
        return makeResponse({
          status: 503,
          ok: false,
          body: { success: false, error: 'MCP host not initialized' },
        });
      }
      return makeResponse({ body: { success: true, data: [] } });
    });

    const c = mount();
    await flush();

    // Error message present
    expect(c.textContent).toContain('MCP error');
    expect(c.textContent).toContain('MCP host not initialized');
    // No server rows fabricated
    expect(c.querySelectorAll('.mcp-server-row').length).toBe(0);
  });

  it('renders degrade-safe banner when backend is unreachable', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const c = mount();
    await flush();

    // Unreachable banner
    expect(c.textContent).toContain('MCP host unavailable');
    expect(c.textContent).toContain('Backend unreachable');
    // No fabricated server rows
    expect(c.querySelectorAll('.mcp-server-row').length).toBe(0);
  });

  it('registry entry exists with id "mcp"', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'mcp');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('MCP Tools');
    expect(entry?.capability).toBe('mcp-server-registry');
    expect(entry?.primary).toBe(false);
  });

  it('panel loads via dynamic import from registry', async () => {
    const { PANEL_REGISTRY } = await import('../panels/registry');
    const entry = PANEL_REGISTRY.find((p) => p.id === 'mcp');
    expect(entry).toBeDefined();
    const Component = await entry!.load();
    expect(typeof Component).toBe('function');
  });
});
