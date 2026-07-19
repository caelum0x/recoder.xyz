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
});
