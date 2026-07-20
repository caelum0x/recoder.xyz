/**
 * recodergit code-intel — the read-only query surface over an indexed repo graph.
 *
 * Proves the SERVICE (`RecoderGitService.codeIntel`) maps each op onto the right
 * in-process engine `callTool` method + params, and degrades TRUTHFULLY (flag off
 * → no-op; not indexed / lib-absent / engine-throw → `available:false` + reason,
 * never a fabricated payload), plus the ADAPTER op routing over the same seam.
 *
 * The engine `callTool` seam is MOCKED via the injectable `loadEngineLib` dep, so
 * no real clone/index/LadybugDB is touched. The live path is the vendored
 * `LocalBackend.callTool` (query / impact / context) — exercised in the desktop
 * engine's own suite, not here.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createRecoderGitService,
  type EngineLib,
  type IndexState,
  type IndexStateStore,
} from './recodergit-service.js';
import { RecodergitAdapter } from './adapters/cli/recodergit.adapter.js';
import type { EnginesConfig } from './config.js';

/** Deterministic in-memory index-state store seeded with an indexed repo. */
function storeWith(repoId: string, repoRoot: string): IndexStateStore {
  const state: IndexState = {
    repoId,
    repoRoot,
    branch: 'main',
    lastIndexedSha: 'abc',
    indexedAt: '2026-07-19T00:00:00.000Z',
    nodes: 10,
    edges: 20,
    status: 'indexed',
  };
  const map = new Map<string, IndexState>([[repoId, state]]);
  return {
    get: id => map.get(id) ?? null,
    set: (id, s) => void map.set(id, s),
  };
}

/** A fake engine lib whose `callTool` records the last (method, params) call. */
function libWithCallTool(impl: EngineLib['callTool']): {
  lib: EngineLib;
  calls: Array<{ method: string; params: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const callTool: EngineLib['callTool'] = async (method, params) => {
    calls.push({ method, params });
    return impl!(method, params);
  };
  return {
    lib: { runFullAnalysis: async () => ({ stats: {} }), callTool },
    calls,
  };
}

const NOOP_LOG = { error: () => undefined };

describe('RecoderGitService.codeIntel — engine-method mapping', () => {
  it('symbol_search → callTool("query", { repo, search_query, ... })', async () => {
    const { lib, calls } = libWithCallTool(async () => ({ results: ['x'] }));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    const res = await service.codeIntel('symbol_search', 'r1', {
      query: 'auth',
      limit: 3,
      maxSymbols: 7,
      includeContent: true,
    });
    expect(res.enabled).toBe(true);
    if (res.enabled) {
      expect(res.available).toBe(true);
      expect(res.result).toEqual({ results: ['x'] });
    }
    expect(calls[0]).toEqual({
      method: 'query',
      params: {
        repo: '/repo/r1',
        search_query: 'auth',
        limit: 3,
        max_symbols: 7,
        include_content: true,
      },
    });
  });

  it('find_references → callTool("impact", { direction:"upstream", target })', async () => {
    const { lib, calls } = libWithCallTool(async () => ({ impactedCount: 2 }));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    await service.codeIntel('find_references', 'r1', {
      symbol: 'login',
      filePath: 'src/a.ts',
      maxDepth: 2,
    });
    expect(calls[0]).toEqual({
      method: 'impact',
      params: {
        repo: '/repo/r1',
        target: 'login',
        direction: 'upstream',
        file_path: 'src/a.ts',
        maxDepth: 2,
      },
    });
  });

  it('call_graph → callTool("impact", { direction:"downstream", target })', async () => {
    const { lib, calls } = libWithCallTool(async () => ({ impactedCount: 5 }));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    await service.codeIntel('call_graph', 'r1', { symbol: 'login' });
    expect(calls[0]).toEqual({
      method: 'impact',
      params: { repo: '/repo/r1', target: 'login', direction: 'downstream' },
    });
  });

  it('definition → callTool("context", { name, ... })', async () => {
    const { lib, calls } = libWithCallTool(async () => ({ node: 'n' }));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    await service.codeIntel('definition', 'r1', {
      symbol: 'login',
      kind: 'Function',
      includeContent: true,
    });
    expect(calls[0]).toEqual({
      method: 'context',
      params: {
        repo: '/repo/r1',
        name: 'login',
        kind: 'Function',
        include_content: true,
      },
    });
  });

  it('an explicit repo path overrides the indexed state root', async () => {
    const { lib, calls } = libWithCallTool(async () => ({}));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    await service.codeIntel('symbol_search', 'r1', {
      query: 'x',
      repo: '/other/path',
    });
    expect(calls[0]?.params.repo).toBe('/other/path');
  });
});

describe('RecoderGitService.codeIntel — truthful degrade', () => {
  it('flag off → pure no-op { enabled:false }', async () => {
    const service = createRecoderGitService({ isEnabled: () => false });
    const res = await service.codeIntel('symbol_search', 'r1', { query: 'x' });
    expect(res).toEqual({ enabled: false });
  });

  it('not indexed (no state, no repo override) → available:false, truthful reason', async () => {
    const { lib } = libWithCallTool(async () => ({}));
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: { get: () => null, set: () => undefined },
      logger: NOOP_LOG,
    });
    const res = await service.codeIntel('symbol_search', 'missing', {
      query: 'x',
    });
    expect(res.enabled).toBe(true);
    if (res.enabled) {
      expect(res.available).toBe(false);
      expect(res.reason).toMatch(/not indexed/i);
    }
  });

  it('in-process lib absent (no callTool) → available:false, truthful reason', async () => {
    const service = createRecoderGitService({
      // A lib with NO callTool models the vendored dist present but LocalBackend absent.
      loadEngineLib: async () => ({
        runFullAnalysis: async () => ({ stats: {} }),
      }),
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    const res = await service.codeIntel('definition', 'r1', { symbol: 'f' });
    expect(res.enabled).toBe(true);
    if (res.enabled) {
      expect(res.available).toBe(false);
      expect(res.reason).toMatch(/in-process engine lib/i);
    }
  });

  it('engine callTool throws → available:false with the real reason (never throws the seam)', async () => {
    const service = createRecoderGitService({
      loadEngineLib: async () => ({
        runFullAnalysis: async () => ({ stats: {} }),
        callTool: async () => {
          throw new Error('LadybugDB WAL corrupt');
        },
      }),
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    const res = await service.codeIntel('call_graph', 'r1', { symbol: 'f' });
    expect(res.enabled).toBe(true);
    if (res.enabled) {
      expect(res.available).toBe(false);
      expect(res.reason).toMatch(/WAL corrupt/);
    }
  });
});

describe('RecoderGitService.queryContext — code-aware launch context', () => {
  /** A lib whose callTool dispatches per method (route_map/query/context). */
  function libByMethod(
    impl: Record<string, (params: Record<string, unknown>) => unknown>
  ): {
    lib: EngineLib;
    calls: Array<{ method: string; params: Record<string, unknown> }>;
  } {
    const calls: Array<{ method: string; params: Record<string, unknown> }> =
      [];
    const callTool: EngineLib['callTool'] = async (method, params) => {
      calls.push({ method, params });
      const fn = impl[method];
      if (!fn) throw new Error(`unexpected method ${method}`);
      return fn(params);
    };
    return {
      lib: { runFullAnalysis: async () => ({ stats: {} }), callTool },
      calls,
    };
  }

  it('composes REAL domainMap + symbol_search + definition context for the seeds', async () => {
    const { lib, calls } = libByMethod({
      route_map: () => ({
        domains: [
          { name: 'auth', files: ['src/auth/login.ts'] },
          { name: 'billing', files: ['src/billing/plan.ts'] },
        ],
      }),
      query: p => ({
        results: [{ symbol: 'login', file: 'src/auth/login.ts' }],
        q: p.search_query,
      }),
      context: p => ({ node: { name: p.name }, callers: ['handleAuth'] }),
    });
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });

    const res = await service.queryContext('r1', ['login']);
    expect(res.enabled).toBe(true);
    if (!res.enabled) return;
    expect(res.available).toBe(true);
    // DomainMap overview came from the engine's route_map (real projection).
    expect(res.domainMap?.domains.map(d => d.name)).toEqual([
      'auth',
      'billing',
    ]);
    // symbol_search carried the raw engine payload untouched.
    expect(res.symbols).toEqual([
      {
        term: 'login',
        result: {
          results: [{ symbol: 'login', file: 'src/auth/login.ts' }],
          q: 'login',
        },
      },
    ]);
    // definition (engine `context`) carried the raw 360° payload untouched.
    expect(res.definitions).toEqual([
      {
        symbol: 'login',
        result: { node: { name: 'login' }, callers: ['handleAuth'] },
      },
    ]);
    // The engine methods actually FIRED (route_map + query + context).
    expect(calls.map(c => c.method).sort()).toEqual([
      'context',
      'query',
      'route_map',
    ]);
  });

  it('flag off → pure no-op { enabled:false }', async () => {
    const service = createRecoderGitService({ isEnabled: () => false });
    const res = await service.queryContext('r1', ['login']);
    expect(res).toEqual({ enabled: false });
  });

  it('not indexed (no state) → available:false, truthful reason (never fabricated)', async () => {
    const { lib } = libByMethod({});
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: { get: () => null, set: () => undefined },
      logger: NOOP_LOG,
    });
    const res = await service.queryContext('missing', ['login']);
    expect(res.enabled).toBe(true);
    if (!res.enabled) return;
    expect(res.available).toBe(false);
    expect(res.reason).toMatch(/not indexed/i);
    expect(res.domainMap).toBeUndefined();
    expect(res.symbols).toEqual([]);
    expect(res.definitions).toEqual([]);
  });

  it('in-process lib absent (no callTool) → available:false, truthful reason', async () => {
    const service = createRecoderGitService({
      loadEngineLib: async () => ({
        runFullAnalysis: async () => ({ stats: {} }),
      }),
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    const res = await service.queryContext('r1', ['login']);
    expect(res.enabled).toBe(true);
    if (!res.enabled) return;
    expect(res.available).toBe(false);
    expect(res.reason).toMatch(/in-process engine lib/i);
  });

  it('indexed but empty for the seeds → available:false (truthful, not fabricated)', async () => {
    const { lib } = libByMethod({
      route_map: () => ({ domains: [] }),
      query: () => ({ results: [] }),
      context: () => {
        throw new Error('no such symbol');
      },
    });
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    // symbol_search returns a payload ({results:[]}) so `symbols` is non-empty;
    // use a seed with NO domains + a throwing context to force the empty path.
    const res = await service.queryContext('r1', [], { maxTerms: 0 });
    expect(res.enabled).toBe(true);
    if (!res.enabled) return;
    expect(res.available).toBe(false);
    expect(res.reason).toMatch(/no context/i);
  });

  it('dedupes + bounds seed terms (fan-out is capped)', async () => {
    const { lib, calls } = libByMethod({
      route_map: () => ({ domains: [] }),
      query: () => ({ results: ['x'] }),
      context: () => ({ node: 'n' }),
    });
    const service = createRecoderGitService({
      loadEngineLib: async () => lib,
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    await service.queryContext('r1', ['Login', 'login', 'auth'], {
      maxTerms: 1,
    });
    // maxTerms:1 ⇒ exactly one query + one context (plus one route_map).
    expect(calls.filter(c => c.method === 'query')).toHaveLength(1);
    expect(calls.filter(c => c.method === 'context')).toHaveLength(1);
  });
});

describe('RecodergitAdapter — code-intel op routing', () => {
  const cfg = { enabled: { recodergit: true } } as unknown as EnginesConfig;
  const log = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as never;

  function adapterWith(
    calls: Array<{ op: string; input: Record<string, unknown> }>
  ) {
    const service = createRecoderGitService({
      loadEngineLib: async () => ({
        runFullAnalysis: async () => ({ stats: {} }),
        callTool: async (method, params) => {
          calls.push({ op: method, input: params });
          return { method };
        },
      }),
      store: storeWith('r1', '/repo/r1'),
      logger: NOOP_LOG,
    });
    return new RecodergitAdapter({ config: cfg, log, service });
  }

  it('routes symbol-search and returns the passthrough payload', async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const adapter = adapterWith(calls);
    const res = await adapter.invoke({
      op: 'symbol-search',
      input: { repoId: 'r1', query: 'x' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        op: 'symbol_search',
        repoId: 'r1',
        available: true,
      });
    }
    expect(calls[0]?.op).toBe('query');
  });

  it('requires repoId for a code-intel op (truthful bad_input)', async () => {
    const adapter = adapterWith([]);
    const res = await adapter.invoke({
      op: 'definition',
      input: { symbol: 'f' },
    });
    expect(res).toMatchObject({ ok: false, code: 'bad_input' });
  });

  it('maps find-references to an upstream impact call', async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const adapter = adapterWith(calls);
    await adapter.invoke({
      op: 'find-references',
      input: { repoId: 'r1', symbol: 'login' },
    });
    expect(calls[0]).toMatchObject({
      op: 'impact',
      input: { direction: 'upstream', target: 'login' },
    });
  });

  it('routes query-context through the composed engine calls (real fusion fires)', async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const adapter = adapterWith(calls);
    const res = await adapter.invoke({
      op: 'query-context',
      input: { repoId: 'r1', seedTerms: ['login'] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({ repoId: 'r1', available: true });
    }
    // route_map + query + context all fired against the engine seam.
    expect(calls.map(c => c.op).sort()).toEqual([
      'context',
      'query',
      'route_map',
    ]);
  });

  it('query-context requires repoId (truthful bad_input)', async () => {
    const adapter = adapterWith([]);
    const res = await adapter.invoke({
      op: 'query-context',
      input: { seedTerms: ['x'] },
    });
    expect(res).toMatchObject({ ok: false, code: 'bad_input' });
  });
});
