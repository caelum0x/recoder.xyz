/**
 * Tests for the recodergit code-intelligence MCP tools: the CLOSED anonymous
 * refusal (a caller identity is required — the cross-tenant class stays closed),
 * required-arg validation, correct op routing + engine-param mapping onto the
 * adapter seam, and the truthful degrade when the seam reports the engine down or
 * the repo not indexed.
 */
import { describe, it, expect, vi } from 'vitest';
import type { McpToolCaller } from '../../../shared/module-base.js';
import type { InvokeResult } from '../types.js';
import { ok, fail } from '../types.js';
import {
  buildRecodergitIntelMcpTools,
  recodergitIntelMcpServer,
  type RecodergitIntelOp,
} from './recodergit-intel.mcp.js';

type Invoke = (
  op: RecodergitIntelOp,
  input: Record<string, unknown>
) => Promise<InvokeResult<unknown>>;

function toolsWith(invoke: Invoke) {
  const tools = buildRecodergitIntelMcpTools({ invoke });
  const byName = new Map(tools.map(t => [t.name, t]));
  return {
    search: byName.get('recodergit.symbol_search')!,
    refs: byName.get('recodergit.find_references')!,
    callGraph: byName.get('recodergit.call_graph')!,
    def: byName.get('recodergit.definition')!,
  };
}

const user = (userId: string): McpToolCaller => ({ userId, scopes: ['read'] });

describe('recodergit code-intel MCP tools — server descriptor', () => {
  it('declares the four code-intel tools under the recodergit server id', () => {
    expect(recodergitIntelMcpServer.serverId).toBe('recodergit');
    expect([...recodergitIntelMcpServer.toolNames]).toEqual([
      'recodergit.symbol_search',
      'recodergit.find_references',
      'recodergit.call_graph',
      'recodergit.definition',
    ]);
    const names = buildRecodergitIntelMcpTools({
      invoke: async () => ok(null),
    }).map(t => t.name);
    expect(names).toEqual([...recodergitIntelMcpServer.toolNames]);
  });
});

describe('anonymous refusal (cross-tenant class CLOSED)', () => {
  it('every tool refuses with no authorized caller (AUTH_REQUIRED)', async () => {
    const t = toolsWith(async () => ok({}));
    await expect(
      t.search.handler({ repoId: 'r1', query: 'x' }, undefined)
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(
      t.refs.handler({ repoId: 'r1', symbol: 'f' }, undefined)
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(
      t.callGraph.handler({ repoId: 'r1', symbol: 'f' }, undefined)
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(
      t.def.handler({ repoId: 'r1', symbol: 'f' }, undefined)
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
});

describe('required-arg validation', () => {
  it('symbol_search requires repoId and query', async () => {
    const { search } = toolsWith(async () => ok({}));
    await expect(
      search.handler({ query: 'x' }, user('u1'))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      search.handler({ repoId: 'r1' }, user('u1'))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('find_references / call_graph require repoId and symbol', async () => {
    const { refs, callGraph } = toolsWith(async () => ok({}));
    await expect(
      refs.handler({ repoId: 'r1' }, user('u1'))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      callGraph.handler({ symbol: 'f' }, user('u1'))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('definition requires repoId and (symbol or uid)', async () => {
    const { def } = toolsWith(async () => ok({}));
    await expect(
      def.handler({ repoId: 'r1' }, user('u1'))
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const invoke = vi.fn(async () => ok({ node: 'n' }));
    const t = toolsWith(invoke);
    await t.def.handler({ repoId: 'r1', uid: 'sym:42' }, user('u1'));
    expect(invoke).toHaveBeenCalledWith('definition', {
      repoId: 'r1',
      uid: 'sym:42',
    });
  });
});

describe('op routing + param mapping onto the adapter seam', () => {
  it('symbol_search → symbol-search op with forwarded bounds', async () => {
    const invoke = vi.fn(async () => ok({ results: [] }));
    const { search } = toolsWith(invoke);
    await search.handler(
      {
        repoId: 'r1',
        query: 'auth flow',
        limit: 3,
        maxSymbols: 8,
        includeContent: true,
      },
      user('u1')
    );
    expect(invoke).toHaveBeenCalledWith('symbol-search', {
      repoId: 'r1',
      query: 'auth flow',
      limit: 3,
      maxSymbols: 8,
      includeContent: true,
    });
  });

  it('find_references → find-references op (upstream semantics owned by the service)', async () => {
    const invoke = vi.fn(async () => ok({ impactedCount: 2 }));
    const { refs } = toolsWith(invoke);
    await refs.handler(
      { repoId: 'r1', symbol: 'login', filePath: 'src/auth.ts', maxDepth: 2 },
      user('u1')
    );
    expect(invoke).toHaveBeenCalledWith('find-references', {
      repoId: 'r1',
      symbol: 'login',
      filePath: 'src/auth.ts',
      maxDepth: 2,
    });
  });

  it('call_graph → call-graph op', async () => {
    const invoke = vi.fn(async () => ok({ impactedCount: 5 }));
    const { callGraph } = toolsWith(invoke);
    await callGraph.handler({ repoId: 'r1', symbol: 'login' }, user('u1'));
    expect(invoke).toHaveBeenCalledWith('call-graph', {
      repoId: 'r1',
      symbol: 'login',
    });
  });

  it('definition → definition op with the symbol name', async () => {
    const invoke = vi.fn(async () => ok({ node: 'n' }));
    const { def } = toolsWith(invoke);
    await def.handler(
      { repoId: 'r1', symbol: 'login', kind: 'Function' },
      user('u1')
    );
    expect(invoke).toHaveBeenCalledWith('definition', {
      repoId: 'r1',
      symbol: 'login',
      kind: 'Function',
    });
  });
});

describe('degrade-safe presentation', () => {
  it('passes through a truthful available:false payload from the adapter', async () => {
    const { search } = toolsWith(async () =>
      ok({
        op: 'symbol_search',
        repoId: 'r1',
        available: false,
        reason: 'repo not indexed',
      })
    );
    const out = await search.handler({ repoId: 'r1', query: 'x' }, user('u1'));
    expect(out).toEqual({
      op: 'symbol_search',
      repoId: 'r1',
      available: false,
      reason: 'repo not indexed',
    });
  });

  it('surfaces an engine-disabled invoke fail truthfully as { available:false, reason }', async () => {
    const { def } = toolsWith(async () =>
      fail('recodergit disabled', 'disabled')
    );
    const out = await def.handler({ repoId: 'r1', symbol: 'f' }, user('u1'));
    expect(out).toEqual({
      available: false,
      reason: 'recodergit disabled',
      code: 'disabled',
    });
  });
});
