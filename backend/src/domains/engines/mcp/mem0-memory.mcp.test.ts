/**
 * Tests for the mem0 memory-insight MCP tools: the CLOSED cross-tenant identity
 * binding (subject bound to the host-authorized caller, not `args`), the FORCED
 * own-scope on the aggregate reads, the privileged global path, and the truthful
 * degrade when the adapter seam reports the sidecar down.
 */
import { describe, it, expect, vi } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { InvokeResult } from '../types.js';
import { ok, fail } from '../types.js';
import {
  buildMem0MemoryMcpTools,
  mem0MemoryMcpServer,
  type Mem0InsightOp,
} from './mem0-memory.mcp.js';

type Invoke = (op: Mem0InsightOp, input: Record<string, unknown>) => Promise<InvokeResult<unknown>>;

function toolsWith(invoke: Invoke) {
  const tools = buildMem0MemoryMcpTools({ invoke });
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    recall: byName.get('mem0.recall')!,
    relations: byName.get('mem0.relations')!,
    stats: byName.get('mem0.stats')!,
  };
}

const user = (userId: string, scopes: string[] = ['read', 'write']): McpToolCaller => ({ userId, scopes });
const admin: McpToolCaller = { userId: 'svc', scopes: ['admin', 'internal'] };

describe('mem0 memory-insight MCP tools — server descriptor', () => {
  it('declares the three insight tools under the mem0 server id', () => {
    expect(mem0MemoryMcpServer.serverId).toBe('mem0');
    expect([...mem0MemoryMcpServer.toolNames]).toEqual(['mem0.recall', 'mem0.relations', 'mem0.stats']);
    const names = buildMem0MemoryMcpTools({ invoke: async () => ok(null) }).map((t) => t.name);
    expect(names).toEqual([...mem0MemoryMcpServer.toolNames]);
  });
});

describe('mem0.recall — tenant identity', () => {
  it('refuses with no authorized caller (AUTH_REQUIRED)', async () => {
    const { recall } = toolsWith(async () => ok({ results: [] }));
    await expect(recall.handler({ query: 'x' }, undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('binds the subject to the caller and passes it to invoke', async () => {
    const invoke = vi.fn(async () => ok({ results: [{ id: 'm1' }] }));
    const { recall } = toolsWith(invoke);
    const out = await recall.handler({ query: 'plans', limit: 5 }, user('u1'));
    expect(invoke).toHaveBeenCalledWith('recall', { userId: 'u1', query: 'plans', limit: 5 });
    expect(out).toEqual({ results: [{ id: 'm1' }] });
  });

  it('rejects a non-privileged caller targeting another subject (403)', async () => {
    const { recall } = toolsWith(async () => ok({ results: [] }));
    await expect(recall.handler({ userId: 'victim', query: 'x' }, user('u1'))).rejects.toMatchObject({
      code: 'AUTHZ_PROJECT_ACCESS_DENIED',
    });
  });

  it('lets an admin/internal caller target an arbitrary subject', async () => {
    const invoke = vi.fn(async () => ok({ results: [] }));
    const { recall } = toolsWith(invoke);
    await recall.handler({ userId: 'tenant-42' }, admin);
    expect(invoke).toHaveBeenCalledWith('recall', { userId: 'tenant-42' });
  });

  it('forwards the time window + metadata filters', async () => {
    const invoke = vi.fn(async () => ok({ results: [] }));
    const { recall } = toolsWith(invoke);
    await recall.handler(
      { createdAfter: '2026-01-01T00:00:00Z', createdBefore: '2026-02-01T00:00:00Z', metadata: { topic: 'auth' } },
      user('u1'),
    );
    expect(invoke).toHaveBeenCalledWith('recall', {
      userId: 'u1',
      createdAfter: '2026-01-01T00:00:00Z',
      createdBefore: '2026-02-01T00:00:00Z',
      metadata: { topic: 'auth' },
    });
  });
});

describe('mem0.relations — aggregate scope stays closed', () => {
  it('FORCES a non-privileged caller to its own scope', async () => {
    const invoke = vi.fn(async () => ok({ nodes: [], edges: [] }));
    const { relations } = toolsWith(invoke);
    // caller tries to widen to global by omitting userId — still scoped to them
    await relations.handler({ focus: 'a1' }, user('u1'));
    expect(invoke).toHaveBeenCalledWith('relations', { userId: 'u1', focus: 'a1' });
  });

  it('ignores an args userId for a non-privileged caller (own scope wins)', async () => {
    const invoke = vi.fn(async () => ok({ nodes: [], edges: [] }));
    const { relations } = toolsWith(invoke);
    await relations.handler({ userId: 'victim' }, user('u1'));
    expect(invoke).toHaveBeenCalledWith('relations', { userId: 'u1' });
  });

  it('lets an admin caller request the global (unscoped) graph', async () => {
    const invoke = vi.fn(async () => ok({ nodes: [], edges: [] }));
    const { relations } = toolsWith(invoke);
    await relations.handler({}, admin);
    expect(invoke).toHaveBeenCalledWith('relations', {});
  });
});

describe('mem0.stats — global view is admin-only', () => {
  it('scopes a non-privileged caller to its own totals', async () => {
    const invoke = vi.fn(async () => ok({ total_memories: 3 }));
    const { stats } = toolsWith(invoke);
    await stats.handler({}, user('u1'));
    expect(invoke).toHaveBeenCalledWith('stats', { userId: 'u1' });
  });

  it('lets an admin caller request the global view', async () => {
    const invoke = vi.fn(async () => ok({ total_memories: 100 }));
    const { stats } = toolsWith(invoke);
    await stats.handler({}, admin);
    expect(invoke).toHaveBeenCalledWith('stats', {});
  });
});

describe('degrade-safe presentation', () => {
  it('surfaces a sidecar-down invoke truthfully as { available:false, reason }', async () => {
    const { stats } = toolsWith(async () => fail('mem0 REST GET /insights/stats failed: no sidecar', 'unavailable'));
    const out = await stats.handler({}, admin);
    expect(out).toEqual({
      available: false,
      reason: 'mem0 REST GET /insights/stats failed: no sidecar',
      code: 'unavailable',
    });
  });
});
