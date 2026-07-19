/**
 * `ops-recorder-signals` MCP surface: the query + aggregation tools route to the
 * engine's `signals.query` / `signals.stats` ops with normalised, validated
 * filters, and reject an unknown filter vocabulary before touching the engine.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  opsRecorderSignalsMcpServer,
  buildOpsRecorderSignalsMcpTools,
} from './ops-recorder-signals-mcp.js';
import { ok, fail, type InvokeResult } from '../../../types.js';
import type { EngineCall } from '../../../ports/engine-client.port.js';

function fakeEngine(result: InvokeResult<unknown> = ok({ done: true })) {
  const invoke = vi.fn(async (_call: EngineCall<unknown>) => result);
  return { invoke };
}

const tool = (name: string, engine: ReturnType<typeof fakeEngine>) =>
  buildOpsRecorderSignalsMcpTools(engine).find((t) => t.name === name);

describe('ops-recorder-signals MCP registration', () => {
  it('server declares exactly its built tools', () => {
    const built = buildOpsRecorderSignalsMcpTools(fakeEngine())
      .map((t) => t.name)
      .sort();
    expect(built).toEqual([...opsRecorderSignalsMcpServer.toolNames].sort());
    expect(opsRecorderSignalsMcpServer.metadata).toMatchObject({ external: false });
    // A distinct serverId from the write/detect ops-recorder server.
    expect(opsRecorderSignalsMcpServer.serverId).toBe('ops-recorder-signals');
  });
});

describe('ops-recorder.query', () => {
  it('routes no-arg calls to signals.query with an empty filter set', async () => {
    const engine = fakeEngine(ok([]));
    await tool('ops-recorder.query', engine)?.handler({});
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'signals.query', input: { filters: {} } });
  });

  it('normalises item_type/itemType and passes validated filters through', async () => {
    const engine = fakeEngine(ok([]));
    await tool('ops-recorder.query', engine)?.handler({
      source: 'github',
      item_type: 'pull_request',
      priority: 'high',
      resolved: false,
      since: '2026-01-01T00:00:00Z',
      limit: 5,
    });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'signals.query',
      input: {
        filters: {
          source: 'github',
          itemType: 'pull_request',
          priority: 'high',
          resolved: false,
          since: '2026-01-01T00:00:00Z',
          limit: 5,
        },
      },
    });
  });

  it('rejects an unknown source without calling the engine', async () => {
    const engine = fakeEngine();
    const out = await tool('ops-recorder.query', engine)?.handler({ source: 'jira' });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('rejects a negative limit without calling the engine', async () => {
    const engine = fakeEngine();
    const out = await tool('ops-recorder.query', engine)?.handler({ limit: -1 });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });

  it('flattens an engine failure into {error, code}', async () => {
    const engine = fakeEngine(fail('engine down', 'engine_down'));
    const out = await tool('ops-recorder.query', engine)?.handler({});
    expect(out).toEqual({ error: 'engine down', code: 'engine_down' });
  });
});

describe('ops-recorder.stats', () => {
  it('routes to signals.stats with the scoping filters', async () => {
    const engine = fakeEngine(ok({ total: 0 }));
    await tool('ops-recorder.stats', engine)?.handler({ source: 'linear' });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'signals.stats',
      input: { filters: { source: 'linear' } },
    });
  });

  it('rejects an unknown priority without calling the engine', async () => {
    const engine = fakeEngine();
    const out = await tool('ops-recorder.stats', engine)?.handler({ priority: 'urgent' });
    expect(out).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
  });
});
