/**
 * Tests for the `recoder.dmux` MCP binder: the four pane/layout tools are
 * registered on the router, their handlers parse args and call the injected
 * {@link DmuxLayoutPort}, the `InvokeResult` is unwrapped onto the MCP envelope (a
 * failure throws the real reason), audit `requestedBy` is threaded from the
 * authorized caller for the two side-effecting ops, boundary validation throws on
 * a bad preset, and an unbound port (null) still registers callable handlers that
 * report unavailability instead of 404-ing.
 */
import { describe, it, expect } from 'vitest';
import { McpRegistry, McpToolRouter } from '@recoder/agent-mcp';
import { ok, fail, type InvokeResult } from '../types.js';
import type { DmuxLayoutPort } from '../dmux-adapter.js';
import { dmuxLayoutMcpServer, dmuxLayoutEngineBinder, DMUX_LAYOUT_SERVER_ID } from './dmux-layout-engine.js';

/** A spy port recording the last input per method, answering with a fixed result. */
function spyPort(result: InvokeResult<unknown> = ok({ done: true })) {
  const seen: Record<string, unknown> = {};
  const port: DmuxLayoutPort = {
    async presets() {
      seen.presets = true;
      return result as InvokeResult<never>;
    },
    async listPanes(input) {
      seen.listPanes = input;
      return result as InvokeResult<never>;
    },
    async createPanes(input) {
      seen.createPanes = input;
      return result as InvokeResult<never>;
    },
    async applyLayout(input) {
      seen.applyLayout = input;
      return result as InvokeResult<never>;
    },
  };
  return { port, seen };
}

function router(port: DmuxLayoutPort | null): McpToolRouter {
  const r = new McpToolRouter(new McpRegistry());
  dmuxLayoutEngineBinder(port)(r);
  return r;
}

function call(r: McpToolRouter, toolName: string, args: Record<string, unknown>, caller?: { userId: string }) {
  return r.call({
    server: dmuxLayoutMcpServer,
    toolName,
    actor: { agentId: 'agent-1' } as never,
    args,
    ...(caller ? { caller } : {}),
  } as never);
}

describe('dmuxLayoutMcpServer descriptor', () => {
  it('advertises the four pane/layout tools under the recoder.dmux server id', () => {
    expect(dmuxLayoutMcpServer.serverId).toBe(DMUX_LAYOUT_SERVER_ID);
    expect(dmuxLayoutMcpServer.toolNames).toEqual([
      'dmux.layout_presets',
      'dmux.panes_list',
      'dmux.panes_create',
      'dmux.layout_apply',
    ]);
  });
});

describe('pane/layout tool handlers', () => {
  it('layout_presets returns the preset catalog envelope', async () => {
    const { port, seen } = spyPort(ok({ presets: [{ name: 'agent-grid' }], sidebarWidth: 40 }));
    const res = await call(router(port), 'dmux.layout_presets', {});
    expect(seen.presets).toBe(true);
    expect(res.content).toEqual({ presets: [{ name: 'agent-grid' }], sidebarWidth: 40 });
    expect(res.metadata).toMatchObject({ engine: 'dmux', tool: 'dmux.layout_presets' });
  });

  it('panes_list forwards an optional target', async () => {
    const { port, seen } = spyPort(ok({ panes: [] }));
    await call(router(port), 'dmux.panes_list', { target: 'recoder-abc' });
    expect(seen.listPanes).toEqual({ target: 'recoder-abc' });
  });

  it('panes_list omits target when absent (all-sessions listing)', async () => {
    const { port, seen } = spyPort(ok({ panes: [] }));
    await call(router(port), 'dmux.panes_list', {});
    expect(seen.listPanes).toEqual({});
  });

  it('panes_create parses target/count/cwd/layout and threads requestedBy', async () => {
    const { port, seen } = spyPort(ok({ created: ['%1'] }));
    const res = await call(
      router(port),
      'dmux.panes_create',
      { target: 'recoder-abc', count: 4, cwd: '/repo', layout: 'agent-grid' },
      { userId: 'user-42' },
    );
    expect(seen.createPanes).toEqual({ target: 'recoder-abc', count: 4, cwd: '/repo', layout: 'agent-grid' });
    expect(res.metadata).toMatchObject({ requestedBy: 'user-42' });
  });

  it('layout_apply falls back to actor.agentId when no edge caller is bound', async () => {
    const { port, seen } = spyPort(ok({ preset: 'tiled' }));
    const res = await call(router(port), 'dmux.layout_apply', { target: 'recoder-abc', preset: 'tiled' });
    expect(seen.applyLayout).toEqual({ target: 'recoder-abc', preset: 'tiled' });
    expect(res.metadata).toMatchObject({ requestedBy: 'agent-1' });
  });
});

describe('truthful degrade + validation', () => {
  it('throws the real reason when the port returns a failure', async () => {
    const { port } = spyPort(fail('tmux not found', 'tmux_error'));
    await expect(call(router(port), 'dmux.panes_list', {})).rejects.toThrow(/tmux not found/);
  });

  it('throws a truthful "not bound" when the port is null (no 404)', async () => {
    await expect(call(router(null), 'dmux.layout_presets', {})).rejects.toThrow(/not bound/);
  });

  it('rejects layout_apply with an unknown preset at the boundary', async () => {
    const { port } = spyPort();
    await expect(
      call(router(port), 'dmux.layout_apply', { target: 'recoder-abc', preset: 'spiral' }),
    ).rejects.toThrow(/preset/);
  });

  it('rejects panes_create without a target', async () => {
    const { port } = spyPort();
    await expect(call(router(port), 'dmux.panes_create', { count: 2 })).rejects.toThrow(/args\.target/);
  });
});
