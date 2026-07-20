/**
 * conductor code-intel adapter — the CODE-AWARE launch seam.
 *
 * Proves `createConductorCodeIntel().queryContext` folds the recodergit
 * `query-context` engine payload into a compact prompt block (the fusion that
 * makes an agent run code-aware AT LAUNCH), and DEGRADES TRUTHFULLY to `null`
 * (engine unwired / disabled / not-indexed / empty) so a launch never blocks and
 * never injects fabricated context. Also covers the pure `deriveSeedTerms` and
 * `renderCodeContext` helpers the conductor wiring depends on.
 *
 * The recodergit `EngineClientPort` is a hand-rolled fake — no real engine,
 * clone, or index is touched.
 */
import { describe, it, expect } from 'vitest';
import {
  createConductorCodeIntel,
  deriveSeedTerms,
  renderCodeContext,
} from './code-intel.adapter.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { InvokeResult } from '../../engines/types.js';
import type { Logger } from '../../../shared/logger.js';

const NOOP_LOG = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => NOOP_LOG,
} as unknown as Logger;

/** A recodergit `EngineClientPort` fake whose `invoke` returns a fixed result. */
function fakeRecodergit(
  onInvoke: (
    op: string,
    input: Record<string, unknown>
  ) => InvokeResult<unknown>,
  spy?: Array<{ op: string; input: Record<string, unknown> }>
): EngineClientPort {
  return {
    engineId: 'recodergit',
    transport: 'cli',
    async invoke(call) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      spy?.push({ op: call.op, input });
      return onInvoke(call.op, input);
    },
    async health() {
      return {
        engineId: 'recodergit',
        transport: 'cli',
        status: 'up',
        checkedAt: new Date().toISOString(),
      };
    },
  } as unknown as EngineClientPort;
}

describe('deriveSeedTerms', () => {
  it('keeps identifier-ish tokens and drops NL noise + stopwords', () => {
    const terms = deriveSeedTerms(
      'Please fix the loginHandler and refresh_token flow in auth.service'
    );
    expect(terms).toContain('loginHandler');
    expect(terms).toContain('refresh_token');
    expect(terms).toContain('auth.service');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('fix');
  });

  it('dedupes case-insensitively and bounds the count', () => {
    const terms = deriveSeedTerms(
      'billingService billingService checkout payment invoice ledger refund',
      3
    );
    expect(terms).toHaveLength(3);
    expect(
      terms.filter(t => t.toLowerCase() === 'billingservice')
    ).toHaveLength(1);
  });

  it('empty / non-string prompt → []', () => {
    expect(deriveSeedTerms('')).toEqual([]);
    expect(deriveSeedTerms(undefined as unknown as string)).toEqual([]);
  });
});

describe('renderCodeContext', () => {
  it('renders domainMap + symbols + definitions into a compact block', () => {
    const block = renderCodeContext({
      repoId: 'owner__repo',
      available: true,
      domainMap: { domains: [{ name: 'auth', files: ['a.ts', 'b.ts'] }] },
      symbols: [{ term: 'login', result: { hits: 2 } }],
      definitions: [{ symbol: 'login', result: { node: 'login' } }],
    });
    expect(block).toContain('recodergit code-graph, repo owner__repo');
    expect(block).toContain('Domains: auth (2 files)');
    expect(block).toContain('Symbols for "login"');
    expect(block).toContain('Definition of "login"');
  });

  it('available:false → null (never inject fabricated context)', () => {
    expect(
      renderCodeContext({
        repoId: 'r',
        available: false,
        reason: 'not indexed',
      })
    ).toBeNull();
  });

  it('available:true but no content → null', () => {
    expect(
      renderCodeContext({
        repoId: 'r',
        available: true,
        symbols: [],
        definitions: [],
      })
    ).toBeNull();
  });
});

describe('createConductorCodeIntel.queryContext', () => {
  it('injects the rendered code-context block on an available payload', async () => {
    const spy: Array<{ op: string; input: Record<string, unknown> }> = [];
    const recodergit = fakeRecodergit(
      () => ({
        ok: true,
        value: {
          repoId: 'owner__repo',
          available: true,
          domainMap: { domains: [{ name: 'auth', files: ['a.ts'] }] },
          symbols: [{ term: 'login', result: { hits: 1 } }],
          definitions: [],
        },
      }),
      spy
    );
    const codeIntel = createConductorCodeIntel({
      recodergit,
      beads: null,
      logger: NOOP_LOG,
    });

    const block = await codeIntel.queryContext!('owner__repo', ['login']);
    expect(block).toContain('recodergit code-graph');
    expect(block).toContain('Domains: auth (1 files)');
    // The engine op actually fired with the seed terms.
    expect(spy[0]).toMatchObject({
      op: 'query-context',
      input: { repoId: 'owner__repo', seedTerms: ['login'] },
    });
  });

  it('recodergit unwired → null (truthful skip, launch proceeds raw)', async () => {
    const codeIntel = createConductorCodeIntel({
      recodergit: null,
      beads: null,
      logger: NOOP_LOG,
    });
    expect(await codeIntel.queryContext!('r', ['x'])).toBeNull();
  });

  it('engine ok:false (disabled/unbuilt) → null', async () => {
    const recodergit = fakeRecodergit(() => ({
      ok: false,
      reason: 'disabled',
      code: 'disabled',
    }));
    const codeIntel = createConductorCodeIntel({
      recodergit,
      beads: null,
      logger: NOOP_LOG,
    });
    expect(await codeIntel.queryContext!('r', ['x'])).toBeNull();
  });

  it('not indexed (available:false payload) → null (no fabrication)', async () => {
    const recodergit = fakeRecodergit(() => ({
      ok: true,
      value: { repoId: 'r', available: false, reason: 'repo not indexed' },
    }));
    const codeIntel = createConductorCodeIntel({
      recodergit,
      beads: null,
      logger: NOOP_LOG,
    });
    expect(await codeIntel.queryContext!('r', ['x'])).toBeNull();
  });

  it('missing repoId → null (no engine call)', async () => {
    const spy: Array<{ op: string; input: Record<string, unknown> }> = [];
    const recodergit = fakeRecodergit(() => ({ ok: true, value: {} }), spy);
    const codeIntel = createConductorCodeIntel({
      recodergit,
      beads: null,
      logger: NOOP_LOG,
    });
    expect(await codeIntel.queryContext!('  ', ['x'])).toBeNull();
    expect(spy).toHaveLength(0);
  });

  it('invoke throws → null (never crashes the launch path)', async () => {
    const recodergit = fakeRecodergit(() => {
      throw new Error('boom');
    });
    const codeIntel = createConductorCodeIntel({
      recodergit,
      beads: null,
      logger: NOOP_LOG,
    });
    expect(await codeIntel.queryContext!('r', ['x'])).toBeNull();
  });
});
