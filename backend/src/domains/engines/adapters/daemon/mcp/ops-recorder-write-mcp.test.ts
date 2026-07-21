/**
 * ops-recorder WRITE/DETECT MCP surface (§8.4) — the SCOPED subset the engines
 * module registers on the host (`bindOpsRecorderWriteMcpTools`): `ops-recorder.sync`
 * / `ops-recorder.ingest` / `ops-recorder.resolve`. Locks the registration
 * invariants (valid descriptor, no executor-less orphans, documented omissions)
 * and the write-op routing.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  opsRecorderMcpServer,
  buildOpsRecorderMcpTools,
  OPS_RECORDER_WRITE_TOOL_NAMES,
} from './ops-recorder-mcp.js';
import { ok, type InvokeResult } from '../../../types.js';
import type { EngineCall } from '../../../ports/engine-client.port.js';
import type { McpServerRegistration } from '../../../ports/index.js';

function fakeEngine(result: InvokeResult<unknown> = ok({ done: true })) {
  const invoke = vi.fn(async (_call: EngineCall<unknown>) => result);
  return { invoke };
}

describe('ops-recorder write MCP registration (§8.4)', () => {
  it('descriptor is a valid McpServerRegistration (custom kind + transport)', () => {
    // Type-level assignability (was `kind:'engines'`/`transport:'in-proc'`, both
    // invalid → the server could never be registered). A runtime spread mirrors
    // exactly what `bindOpsRecorderWriteMcpTools` hands `registerServer`.
    const scoped: McpServerRegistration = {
      ...opsRecorderMcpServer,
      toolNames: [...OPS_RECORDER_WRITE_TOOL_NAMES],
    };
    expect(scoped.kind).toBe('custom');
    expect(scoped.transport).toBe('custom');
    expect(scoped.serverId).toBe('ops-recorder');
    expect(scoped.metadata).toMatchObject({ external: false });
  });

  it('every registered write tool has a real executor (no orphan catalog entries)', () => {
    const built = new Set(buildOpsRecorderMcpTools(fakeEngine()).map((t) => t.name));
    for (const name of OPS_RECORDER_WRITE_TOOL_NAMES) {
      expect(built.has(name)).toBe(true);
    }
  });

  it('registers only the write/detect tools — reads + handoff stay unregistered', () => {
    expect([...OPS_RECORDER_WRITE_TOOL_NAMES].sort()).toEqual(
      ['ops-recorder.ingest', 'ops-recorder.resolve', 'ops-recorder.sync'],
    );
    // list/get are served by the sibling ops-recorder-signals query/stats tools;
    // handoff has no product consumer yet — documented, not registered.
    const registered = new Set<string>(OPS_RECORDER_WRITE_TOOL_NAMES);
    for (const name of ['ops-recorder.list', 'ops-recorder.get', 'ops-recorder.handoff']) {
      expect(registered.has(name)).toBe(false);
    }
  });
});

describe('ops-recorder write MCP tool routing', () => {
  it('sync routes to the detector op for the given source', async () => {
    const engine = fakeEngine();
    const sync = buildOpsRecorderMcpTools(engine).find((t) => t.name === 'ops-recorder.sync');
    await sync?.handler({ source: 'linear' });
    expect(engine.invoke).toHaveBeenCalledWith({ op: 'sync.linear', input: {} });
  });

  it('ingest routes a coerced WorkSignalIngest to the ingest op', async () => {
    const engine = fakeEngine();
    const ingest = buildOpsRecorderMcpTools(engine).find((t) => t.name === 'ops-recorder.ingest');
    await ingest?.handler({
      source: 'github',
      item_type: 'pull_request',
      title: 'stuck PR',
      source_url: 'https://github.com/x/y/pull/1',
      detected_reason: 'no review in 5 days',
      priority: 'high',
    });
    expect(engine.invoke).toHaveBeenCalledWith(expect.objectContaining({ op: 'ingest' }));
  });

  it('resolve routes to the status op and validates the boolean', async () => {
    const engine = fakeEngine();
    const resolve = buildOpsRecorderMcpTools(engine).find((t) => t.name === 'ops-recorder.resolve');
    // Missing `resolved` → rejected before the wire.
    expect(await resolve?.handler({ signalId: 'sig-1' })).toMatchObject({ error: expect.any(String) });
    expect(engine.invoke).not.toHaveBeenCalled();
    await resolve?.handler({ signalId: 'sig-1', resolved: true });
    expect(engine.invoke).toHaveBeenCalledWith({
      op: 'status',
      input: { signalId: 'sig-1', resolved: true },
    });
  });
});
