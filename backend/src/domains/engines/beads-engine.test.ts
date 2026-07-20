/**
 * Binding tests for the `recoder.beads` MCP tools — the "one spawner" refactor:
 *  - COVERAGE: the binder registers a handler for EVERY tool the catalog
 *    advertises on `recoder.beads` (verified through the real
 *    `assertWiringComplete` guard, the same one that runs at boot).
 *  - DELEGATION: every tool is a THIN delegate onto the injected engine seam
 *    (`BeadsAdapter.invoke` in production) — exactly one `{ op, input }` call
 *    per tool, no argv construction here (the adapter is the single argv owner).
 *  - TRUTHFUL DEGRADE: a failed invoke / an unbound engine throws the real
 *    reason (fail-closed; the interop host records it) — never a fabricated
 *    issue or memory.
 *  - `beads.memory_promote` is GONE: promotion stays on the governed
 *    memory-lifecycle path only — not advertised, not registered.
 */
import { describe, it, expect } from 'vitest';
import {
  McpRegistry,
  McpToolRouter,
  beadsMcpServer,
  type McpServerRegistration,
  type McpToolCallInput,
} from '@recoder/agent-mcp';
import { assertWiringComplete } from './mcp/engine-registry.js';
import type { EngineCall } from './ports/engine-client.port.js';
import { fail, ok, type InvokeResult } from './types.js';
import type { Invoker } from './adapters/daemon/mcp/daemon-mcp-shared.js';
import { registerBeadsMcpTools } from './beads-engine.js';

/** A fake engine seam that records every `{ op, input }` call. */
function fakeEngine(result: InvokeResult<unknown> = ok({ done: true })): {
  engine: Invoker<unknown>;
  calls: EngineCall<unknown>[];
} {
  const calls: EngineCall<unknown>[] = [];
  return {
    calls,
    engine: {
      async invoke(call: EngineCall<unknown>) {
        calls.push(call);
        return result;
      },
    },
  };
}

function call(toolName: string, args: Record<string, unknown>): McpToolCallInput {
  return {
    server: beadsMcpServer,
    toolName,
    actor: { agentId: 'test-agent' },
    args,
  } as unknown as McpToolCallInput;
}

function router(engine: Invoker<unknown> | null): McpToolRouter {
  const built = new McpToolRouter(new McpRegistry());
  registerBeadsMcpTools(built, { engine });
  return built;
}

describe('binder coverage (the boot wiring guard passes for recoder.beads)', () => {
  it('registers a handler for every advertised beads.* tool', () => {
    const keys = new Set<string>();
    const capture = {
      register: (server: McpServerRegistration, toolName: string) => {
        keys.add(`${server.serverId}:${toolName}`);
      },
    } as unknown as McpToolRouter;

    registerBeadsMcpTools(capture, { engine: fakeEngine().engine });

    // The SAME guard the host runs at boot: no missing server, no missing tool.
    expect(() =>
      assertWiringComplete({
        inProcServers: [beadsMcpServer],
        engineServers: [beadsMcpServer],
        handlerKeys: keys,
      }),
    ).not.toThrow();
  });

  it('beads.memory_promote is neither advertised nor registered (promotion stays governed)', async () => {
    expect(beadsMcpServer.toolNames).not.toContain('beads.memory_promote');
    await expect(
      router(fakeEngine().engine).call(call('beads.memory_promote', { id: 'rc-1' })),
    ).rejects.toThrow(/No MCP handler registered/);
  });
});

describe('thin delegation (each tool → exactly one adapter op)', () => {
  const cases: ReadonlyArray<{
    tool: string;
    args: Record<string, unknown>;
    op: string;
    input: Record<string, unknown>;
  }> = [
    { tool: 'beads.ready', args: {}, op: 'ready', input: {} },
    { tool: 'beads.show', args: { id: 'rc-1' }, op: 'show', input: { id: 'rc-1' } },
    { tool: 'beads.show', args: { issueId: 'rc-2' }, op: 'show', input: { id: 'rc-2' } },
    {
      tool: 'beads.create',
      args: { title: 'T', description: 'D', discoveredFrom: 'rc-9', labels: 'memory' },
      op: 'create',
      input: { title: 'T', description: 'D', discoveredFrom: 'rc-9', labels: 'memory' },
    },
    // `body` is the accepted alias for the description.
    { tool: 'beads.create', args: { title: 'T', body: 'B' }, op: 'create', input: { title: 'T', description: 'B' } },
    {
      tool: 'beads.update',
      args: { id: 'rc-1', status: 'in_progress' },
      op: 'update',
      input: { id: 'rc-1', status: 'in_progress' },
    },
    { tool: 'beads.close', args: { id: 'rc-1', reason: 'done' }, op: 'close', input: { id: 'rc-1', reason: 'done' } },
    { tool: 'beads.sync', args: {}, op: 'sync', input: {} },
    { tool: 'beads.claim', args: { id: 'rc-1' }, op: 'claim', input: { id: 'rc-1' } },
    { tool: 'beads.note', args: { id: 'rc-1', text: 'ev' }, op: 'note', input: { id: 'rc-1', text: 'ev' } },
    {
      tool: 'beads.remember',
      args: { title: 'fact', evidence: 'proof', scope: 'repo', from: 'rc-3' },
      op: 'remember',
      input: { title: 'fact', body: 'proof', scope: 'repo', discoveredFrom: 'rc-3' },
    },
    {
      tool: 'beads.recall',
      args: { query: 'auth', scope: 'repo', limit: 7 },
      op: 'recall_memory',
      input: { query: 'auth', scope: 'repo', limit: 7 },
    },
    // No limit supplied ⇒ none forwarded (the adapter owns the default).
    { tool: 'beads.recall', args: { query: 'auth' }, op: 'recall_memory', input: { query: 'auth' } },
  ];

  for (const c of cases) {
    it(`${c.tool} → invoke({ op: '${c.op}' })`, async () => {
      const { engine, calls } = fakeEngine(ok({ id: 'rc-1' }));
      const result = await router(engine).call(call(c.tool, c.args));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ op: c.op, input: c.input });
      expect(result.content).toEqual({ id: 'rc-1' });
    });
  }
});

describe('boundary validation (bad args never reach the seam)', () => {
  const rejections: ReadonlyArray<{ tool: string; args: Record<string, unknown>; message: RegExp }> = [
    { tool: 'beads.show', args: {}, message: /id is required/ },
    { tool: 'beads.create', args: {}, message: /title is required/ },
    { tool: 'beads.update', args: { status: 'open' }, message: /id is required/ },
    { tool: 'beads.close', args: {}, message: /id is required/ },
    { tool: 'beads.claim', args: {}, message: /id is required/ },
    { tool: 'beads.note', args: { id: 'rc-1' }, message: /text is required/ },
    { tool: 'beads.remember', args: { title: 'fact' }, message: /body/ },
    { tool: 'beads.recall', args: {}, message: /query is required/ },
  ];

  for (const c of rejections) {
    it(`${c.tool} rejects`, async () => {
      const { engine, calls } = fakeEngine();
      await expect(router(engine).call(call(c.tool, c.args))).rejects.toThrow(c.message);
      expect(calls).toHaveLength(0);
    });
  }
});

describe('truthful degrade (fail-closed, never fabricated)', () => {
  it('surfaces the adapter reason when bd is unavailable', async () => {
    const { engine } = fakeEngine(fail('bd (beads) binary not found (set BEADS_BIN or build the vendored engine)', 'unavailable'));
    await expect(router(engine).call(call('beads.ready', {}))).rejects.toThrow(/bd \(beads\) binary not found/);
  });

  it('throws a truthful not-bound error when no engine is injected', async () => {
    await expect(router(null).call(call('beads.ready', {}))).rejects.toThrow(/beads engine not bound/);
  });
});
