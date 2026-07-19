/**
 * Daemon adapters' MCP surfaces: each builder produces a server whose
 * `toolNames` match its `McpToolRegistration[]`, routes calls to the injected
 * engine's `invoke`, and validates input before touching the engine.
 */
import { describe, it, expect, vi } from 'vitest';
import { colbertMcpServer, buildColbertMcpTools } from './colbert-mcp.js';
import { colbertIndexMcpServer, buildColbertIndexMcpTools } from './colbert-index-mcp.js';
import { opsRecorderMcpServer, buildOpsRecorderMcpTools } from './ops-recorder-mcp.js';
import { multicaMcpServer, buildMulticaMcpTools } from './multica-mcp.js';
import { zitiMcpServer, buildZitiMcpTools } from './ziti-mcp.js';
import { ok, fail, type InvokeResult } from '../../../types.js';
import type { EngineCall } from '../../../ports/engine-client.port.js';

function fakeEngine(result: InvokeResult<unknown> = ok({ done: true })) {
  const invoke = vi.fn(async (_call: EngineCall<unknown>) => result);
  return { invoke };
}

describe('daemon MCP server registrations', () => {
  it('every server declares exactly its built tools', () => {
    const pairs = [
      [colbertMcpServer, buildColbertMcpTools(fakeEngine())],
      [colbertIndexMcpServer, buildColbertIndexMcpTools(fakeEngine())],
      [opsRecorderMcpServer, buildOpsRecorderMcpTools(fakeEngine())],
      [multicaMcpServer, buildMulticaMcpTools(fakeEngine())],
      [zitiMcpServer, buildZitiMcpTools(fakeEngine())],
    ] as const;
    for (const [server, tools] of pairs) {
      const built = tools.map((t) => t.name).sort();
      expect(built).toEqual([...server.toolNames].sort());
      expect(server.metadata).toMatchObject({ external: false });
    }
  });
});

describe('colbert MCP tools', () => {
  it('routes rerank to the engine op with normalized input', async () => {
    const engine = fakeEngine(ok({ available: true, order: [0], passages: ['a'] }));
    const tools = buildColbertMcpTools(engine);
    const rerank = tools.find((t) => t.name === 'colbert.rerank');
    await rerank?.handler({ query: 'q', passages: ['a', 2, 'b'] });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'rerank', input: { query: 'q', passages: ['a', 'b'] } });
  });

  it('validates a missing query without calling the engine', async () => {
    const engine = fakeEngine();
    const rerank = buildColbertMcpTools(engine).find((t) => t.name === 'colbert.rerank');
    const out = await rerank?.handler({ passages: ['a'] });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('flattens an engine failure into {error, code}', async () => {
    const engine = fakeEngine(fail('engine down', 'engine_down'));
    const rerank = buildColbertMcpTools(engine).find((t) => t.name === 'colbert.rerank');
    const out = await rerank?.handler({ query: 'q', passages: ['a'] });
    expect(out).toEqual({ error: 'engine down', code: 'engine_down' });
  });
});

describe('colbert-index MCP tools', () => {
  it('rerank_batch normalizes the batch and routes to the engine op', async () => {
    const engine = fakeEngine(ok({ available: true, results: [] }));
    const tool = buildColbertIndexMcpTools(engine).find((t) => t.name === 'colbert.rerank_batch');
    await tool?.handler({ batch: [{ query: 'q', passages: ['a', 2, 'b'] }] });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'rerank.batch',
      input: { batch: [{ query: 'q', passages: ['a', 'b'] }] },
    });
  });

  it('rerank_batch rejects an empty batch without calling the engine', async () => {
    const engine = fakeEngine();
    const tool = buildColbertIndexMcpTools(engine).find((t) => t.name === 'colbert.rerank_batch');
    expect(await tool?.handler({ batch: [] })).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('collections.list routes with an empty input', async () => {
    const engine = fakeEngine(ok({ indexRoot: '/idx', collections: [] }));
    const tool = buildColbertIndexMcpTools(engine).find((t) => t.name === 'colbert.collections.list');
    await tool?.handler({});
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'collections.list', input: {} });
  });

  it('collections.create REQUIRES an authorized caller (mutation stays closed)', async () => {
    const engine = fakeEngine();
    const tool = buildColbertIndexMcpTools(engine).find(
      (t) => t.name === 'colbert.collections.create',
    );
    // No caller → refuse without touching the engine.
    const out = await tool?.handler({ name: 'docs', passages: ['a'] });
    expect(out).toMatchObject({ error: expect.stringContaining('authorized caller') });
    expect(engine.invoke).not.toHaveBeenCalled();
    // With an authorized caller → the mutation is routed.
    await tool?.handler({ name: 'docs', passages: ['a'], overwrite: true }, { userId: 'u1' });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'collections.create',
      input: { name: 'docs', passages: ['a'], overwrite: true },
    });
  });

  it('collections.create validates passages for an authorized caller', async () => {
    const engine = fakeEngine();
    const tool = buildColbertIndexMcpTools(engine).find(
      (t) => t.name === 'colbert.collections.create',
    );
    expect(await tool?.handler({ name: 'docs', passages: [] }, { userId: 'u1' })).toMatchObject({
      error: expect.any(String),
    });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('collections.drop REQUIRES an authorized caller and a name', async () => {
    const engine = fakeEngine();
    const tool = buildColbertIndexMcpTools(engine).find((t) => t.name === 'colbert.collections.drop');
    expect(await tool?.handler({ name: 'docs' })).toMatchObject({
      error: expect.stringContaining('authorized caller'),
    });
    expect(engine.invoke).not.toHaveBeenCalled();
    await tool?.handler({ name: 'docs' }, { userId: 'u1' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'collections.drop', input: { name: 'docs' } });
  });

  it('collections.stats requires a name', async () => {
    const engine = fakeEngine();
    const tool = buildColbertIndexMcpTools(engine).find(
      (t) => t.name === 'colbert.collections.stats',
    );
    expect(await tool?.handler({})).toMatchObject({ error: expect.any(String) });
    await tool?.handler({ name: 'docs' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'collections.stats', input: { name: 'docs' } });
  });
});

describe('ops-recorder MCP tools', () => {
  it('sync validates source', async () => {
    const engine = fakeEngine();
    const sync = buildOpsRecorderMcpTools(engine).find((t) => t.name === 'ops-recorder.sync');
    expect(await sync?.handler({ source: 'jira' })).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
    await sync?.handler({ source: 'github' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'sync.github', input: {} });
  });

  it('ingest coerces the WorkSignalIngest shape and rejects incomplete input', async () => {
    const engine = fakeEngine();
    const ingest = buildOpsRecorderMcpTools(engine).find((t) => t.name === 'ops-recorder.ingest');
    expect(await ingest?.handler({ source: 'github' })).toMatchObject({ error: expect.any(String) });
    await ingest?.handler({
      source: 'github',
      item_type: 'issue',
      title: 't',
      source_url: 'u',
      detected_reason: 'r',
      priority: 'high',
    });
    expect(engine.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'ingest' }),
    );
  });
});

describe('multica + ziti MCP tools', () => {
  it('multica.assign validates assigneeType', async () => {
    const engine = fakeEngine();
    const assign = buildMulticaMcpTools(engine).find((t) => t.name === 'multica.assign');
    expect(await assign?.handler({ title: 't', assigneeId: 'a', assigneeType: 'x' })).toMatchObject({
      error: expect.any(String),
    });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('ziti.identity.provision requires a name', async () => {
    const engine = fakeEngine();
    const provision = buildZitiMcpTools(engine).find((t) => t.name === 'ziti.identity.provision');
    expect(await provision?.handler({})).toMatchObject({ error: expect.any(String) });
    await provision?.handler({ name: 'runner-1' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'identity.provision', input: { name: 'runner-1' } });
  });
});
