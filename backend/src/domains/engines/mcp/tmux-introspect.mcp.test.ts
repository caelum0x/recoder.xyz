/**
 * Tests for the tmux introspection MCP tools: the CLOSED cross-tenant identity
 * gate (only an admin/internal caller may observe the shared multiplexer), the
 * bounded capture-pane input mapping, the audit `observedBy` echo, and the
 * truthful degrade when the port is unbound or the tmux binary is missing.
 */
import { describe, it, expect, vi } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import { ok, fail } from '../types.js';
import type { TmuxIntrospectPort } from '../adapters/cli/tmux-introspect.adapter.js';
import { buildTmuxIntrospectMcpTools, tmuxIntrospectMcpServer } from './tmux-introspect.mcp.js';

const admin: McpToolCaller = { userId: 'svc', scopes: ['admin', 'internal'] };
const internal: McpToolCaller = { userId: 'worker', scopes: ['internal'] };
const tenant = (userId: string): McpToolCaller => ({ userId, scopes: ['read', 'write'] });

function fakePort(overrides: Partial<TmuxIntrospectPort> = {}): TmuxIntrospectPort {
  return {
    listSessions: async () => ok([]),
    listWindows: async () => ok([]),
    listPanes: async () => ok([]),
    capturePane: async () => ok({ target: 'p', lines: [], content: '', truncated: false }),
    serverInfo: async () =>
      ok({ running: true, version: 'tmux 3.5', vendored: true, bindingPath: '/x/tmux', sessions: 0, clients: 0 }),
    ...overrides,
  };
}

function toolsWith(port: TmuxIntrospectPort | null) {
  const tools = buildTmuxIntrospectMcpTools({ port });
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    listSessions: byName.get('tmux.list_sessions')!,
    listWindows: byName.get('tmux.list_windows')!,
    listPanes: byName.get('tmux.list_panes')!,
    capturePane: byName.get('tmux.capture_pane')!,
    serverInfo: byName.get('tmux.server_info')!,
  };
}

describe('tmux introspection MCP tools — server descriptor', () => {
  it('declares the five read-only tools under the tmux server id', () => {
    expect(tmuxIntrospectMcpServer.serverId).toBe('tmux');
    expect([...tmuxIntrospectMcpServer.toolNames]).toEqual([
      'tmux.list_sessions',
      'tmux.list_windows',
      'tmux.list_panes',
      'tmux.capture_pane',
      'tmux.server_info',
    ]);
    const names = buildTmuxIntrospectMcpTools({ port: fakePort() }).map((t) => t.name);
    expect(names).toEqual([...tmuxIntrospectMcpServer.toolNames]);
  });
});

describe('cross-tenant class stays CLOSED — identity gate', () => {
  it('refuses with no authorized caller (AUTH_REQUIRED)', async () => {
    const { listSessions } = toolsWith(fakePort());
    await expect(listSessions.handler({}, undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('refuses a non-privileged tenant caller (403) on every tool', async () => {
    const tools = toolsWith(fakePort());
    for (const tool of Object.values(tools)) {
      await expect(tool.handler({ target: 'p0' }, tenant('u1'))).rejects.toMatchObject({
        code: 'AUTHZ_PROJECT_ACCESS_DENIED',
      });
    }
  });

  it('allows an admin caller and echoes observedBy for audit', async () => {
    const listSessionsSpy = vi.fn(async () => ok([{ name: 's', id: '$1', windows: 1, attached: true }]));
    const { listSessions } = toolsWith(fakePort({ listSessions: listSessionsSpy }));
    const out = (await listSessions.handler({}, admin)) as Record<string, unknown>;
    expect(listSessionsSpy).toHaveBeenCalledOnce();
    expect(out.observedBy).toBe('svc');
    expect(out.count).toBe(1);
    expect(out.sessions).toEqual([{ name: 's', id: '$1', windows: 1, attached: true }]);
  });

  it('allows an internal caller', async () => {
    const { serverInfo } = toolsWith(fakePort());
    const out = (await serverInfo.handler({}, internal)) as Record<string, unknown>;
    expect(out.observedBy).toBe('worker');
    expect(out.running).toBe(true);
  });
});

describe('argument mapping', () => {
  it('forwards an optional session to listWindows', async () => {
    const listWindowsSpy = vi.fn(async () => ok([]));
    const { listWindows } = toolsWith(fakePort({ listWindows: listWindowsSpy }));
    await listWindows.handler({ session: ' recoder-run-1 ' }, admin);
    expect(listWindowsSpy).toHaveBeenCalledWith('recoder-run-1');
  });

  it('passes undefined session when omitted (all-windows view)', async () => {
    const listWindowsSpy = vi.fn(async () => ok([]));
    const { listWindows } = toolsWith(fakePort({ listWindows: listWindowsSpy }));
    await listWindows.handler({}, admin);
    expect(listWindowsSpy).toHaveBeenCalledWith(undefined);
  });

  it('maps the bounded capture-pane input (target/start/end/join/maxLines)', async () => {
    const captureSpy = vi.fn(async () => ok({ target: '%3', lines: ['a'], content: 'a', truncated: false }));
    const { capturePane } = toolsWith(fakePort({ capturePane: captureSpy }));
    await capturePane.handler(
      { target: '%3', startLine: -100, endLine: 0, join: true, maxLines: 50 },
      admin,
    );
    expect(captureSpy).toHaveBeenCalledWith({
      target: '%3',
      startLine: -100,
      endLine: 0,
      join: true,
      maxLines: 50,
    });
  });

  it('rejects capture-pane without a target (INVALID_INPUT) even for admin', async () => {
    const { capturePane } = toolsWith(fakePort());
    await expect(capturePane.handler({}, admin)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('degrade-safe presentation', () => {
  it('surfaces an unbound port truthfully as { available:false }', async () => {
    const { serverInfo } = toolsWith(null);
    const out = (await serverInfo.handler({}, admin)) as Record<string, unknown>;
    expect(out).toMatchObject({ available: false, code: 'unavailable' });
  });

  it('surfaces a tmux-missing port failure truthfully', async () => {
    const { serverInfo } = toolsWith(
      fakePort({ serverInfo: async () => fail('tmux is not installed on this host', 'unavailable') }),
    );
    const out = (await serverInfo.handler({}, admin)) as Record<string, unknown>;
    expect(out).toEqual({
      available: false,
      reason: 'tmux is not installed on this host',
      code: 'unavailable',
    });
  });
});
