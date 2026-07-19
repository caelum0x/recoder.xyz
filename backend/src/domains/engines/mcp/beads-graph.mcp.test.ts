/**
 * `beads-graph` MCP surface: the issue-graph query tools route to the beads
 * adapter's `blocked` / `graph` / `deps` / `search` / `stats` ops with validated
 * args, reject an unknown filter vocabulary before touching the adapter, and
 * flatten a degrade-safe adapter failure into a truthful `{ error }` (the live
 * path shells to the real `bd` CLI via the BeadsAdapter — mocked here at the
 * `invoke` seam so the wiring is provable without the binary).
 */
import { describe, it, expect, vi } from 'vitest';
import { beadsGraphMcpServer, buildBeadsGraphMcpTools } from './beads-graph.mcp.js';
import { ok, fail, type InvokeResult } from '../types.js';
import type { EngineCall } from '../ports/engine-client.port.js';

function fakeEngine(result: InvokeResult<unknown> = ok({ done: true })) {
  const invoke = vi.fn(async (_call: EngineCall<unknown>) => result);
  return { invoke };
}

const tool = (name: string, engine: ReturnType<typeof fakeEngine>) =>
  buildBeadsGraphMcpTools(engine).find((t) => t.name === name);

describe('beads-graph MCP registration', () => {
  it('server declares exactly its built tools', () => {
    const built = buildBeadsGraphMcpTools(fakeEngine())
      .map((t) => t.name)
      .sort();
    expect(built).toEqual([...beadsGraphMcpServer.toolNames].sort());
    expect(beadsGraphMcpServer.metadata).toMatchObject({ external: false, engine: 'beads' });
    // A distinct serverId from the write/memory `recoder.beads` server.
    expect(beadsGraphMcpServer.serverId).toBe('beads-graph');
  });
});

describe('beads.blocked', () => {
  it('routes a no-arg call to the blocked op with an empty input', async () => {
    const engine = fakeEngine(ok([]));
    await tool('beads.blocked', engine)?.handler({});
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'blocked', input: {} });
  });

  it('passes a parent scope through', async () => {
    const engine = fakeEngine(ok([]));
    await tool('beads.blocked', engine)?.handler({ parent: 'rc-42' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'blocked', input: { parent: 'rc-42' } });
  });
});

describe('beads.graph', () => {
  it('requires an id (no adapter call on missing id)', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.graph', engine)?.handler({});
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('routes id + validated direction/maxDepth to the graph op', async () => {
    const engine = fakeEngine(ok({ nodes: [] }));
    await tool('beads.graph', engine)?.handler({ id: 'rc-1', direction: 'both', maxDepth: 3 });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'graph',
      input: { id: 'rc-1', direction: 'both', maxDepth: 3 },
    });
  });

  it('rejects an unknown direction without calling the adapter', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.graph', engine)?.handler({ id: 'rc-1', direction: 'sideways' });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('rejects a maxDepth below 1 without calling the adapter', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.graph', engine)?.handler({ id: 'rc-1', maxDepth: 0 });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });
});

describe('beads.deps', () => {
  it('routes id + direction/type to the deps op', async () => {
    const engine = fakeEngine(ok([]));
    await tool('beads.deps', engine)?.handler({ id: 'rc-7', direction: 'up', type: 'tracks' });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'deps',
      input: { id: 'rc-7', direction: 'up', type: 'tracks' },
    });
  });

  it("rejects the 'both' direction (deps only supports down|up)", async () => {
    const engine = fakeEngine();
    const out = await tool('beads.deps', engine)?.handler({ id: 'rc-7', direction: 'both' });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });
});

describe('beads.search', () => {
  it('requires a query', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.search', engine)?.handler({});
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('routes query + status/limit to the search op', async () => {
    const engine = fakeEngine(ok([]));
    await tool('beads.search', engine)?.handler({ query: 'auth spine', status: 'open', limit: 5 });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'search',
      input: { query: 'auth spine', status: 'open', limit: 5 },
    });
  });

  it('rejects a limit below 1', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.search', engine)?.handler({ query: 'x', limit: 0 });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });
});

describe('beads.stats', () => {
  it('routes a no-arg call to the stats op (total count)', async () => {
    const engine = fakeEngine(ok({ count: 12 }));
    await tool('beads.stats', engine)?.handler({});
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'stats', input: {} });
  });

  it('passes a validated groupBy + status through', async () => {
    const engine = fakeEngine(ok([]));
    await tool('beads.stats', engine)?.handler({ groupBy: 'status', status: 'open' });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'stats',
      input: { groupBy: 'status', status: 'open' },
    });
  });

  it('rejects an unknown groupBy without calling the adapter', async () => {
    const engine = fakeEngine();
    const out = await tool('beads.stats', engine)?.handler({ groupBy: 'phase' });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('flattens a degrade-safe adapter failure into { error, code }', async () => {
    const engine = fakeEngine(fail('bd (beads) binary not found', 'unavailable'));
    const out = await tool('beads.stats', engine)?.handler({});
    expect(out).toEqual({ error: 'bd (beads) binary not found', code: 'unavailable' });
  });
});
