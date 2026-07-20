/**
 * Contract tests for the unified `GithubModule`:
 *  - health truthfulness: no gh → that facet unavailable (module degraded/down),
 *    gh present-but-unauthenticated → unavailable, disabled code-graph flag /
 *    unbuilt engine → recodergitLib unavailable; `up` ONLY when both facets are.
 *  - every operation is degrade-safe: `{ ok:false, reason }` (never a throw,
 *    never a fabricated success) on missing gh / bad input / disabled engine.
 * All IO is injected — no real gh, git, or engine process is ever spawned.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { CliResult } from '../adapters/cli/cli-exec.js';
import type { RecoderGitService } from '../recodergit-service.js';
import { GithubModule, type GithubCliRunner, extractChangedSymbols } from './github-module.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

type RecordedCall = { bin: string; args: readonly string[] };

/** Fake bounded runner: handler returns a partial result, undefined = ENOENT. */
function fakeRun(
  handler: (bin: string, args: readonly string[]) => Partial<CliResult> | undefined,
  calls: RecordedCall[] = [],
): GithubCliRunner {
  return async (bin, args) => {
    calls.push({ bin, args });
    const partial = handler(bin, args);
    if (!partial) {
      return { ok: false, code: null, stdout: '', stderr: '', reason: `spawn ${bin} ENOENT` };
    }
    return { ok: true, code: 0, stdout: '', stderr: '', ...partial };
  };
}

/** gh runner where --version and auth status succeed; other calls delegated. */
function ghUpRun(
  handler: (bin: string, args: readonly string[]) => Partial<CliResult> | undefined = () => ({}),
  calls: RecordedCall[] = [],
): GithubCliRunner {
  return fakeRun((bin, args) => {
    if (args[0] === '--version') return { stdout: 'gh version 2.60.0 (2026-01-01)\n' };
    if (args[0] === 'auth' && args[1] === 'status') return { stdout: 'Logged in' };
    return handler(bin, args);
  }, calls);
}

/** Minimal truthful RecoderGitService stub (enabled or flag-off). */
function recodergitStub(enabled: boolean): RecoderGitService {
  return {
    isEnabled: () => enabled,
    indexRepo: async (input: { repoRoot: string; repoId: string }) =>
      enabled
        ? {
            enabled: true,
            state: {
              repoId: input.repoId,
              repoRoot: input.repoRoot,
              branch: 'main',
              lastIndexedSha: 'abc123',
              indexedAt: '2026-01-01T00:00:00.000Z',
              nodes: 10,
              edges: 4,
              status: 'indexed',
            },
          }
        : { enabled: false },
    domainMap: async (repoId: string) =>
      enabled
        ? { enabled: true, map: { repoId, domains: [{ name: 'core' }], crossEdges: [] } }
        : { enabled: false },
  } as unknown as RecoderGitService;
}

/** Recorded code-intel call for the blast-radius fusion assertions. */
type IntelCall = { op: string; repoId: string; params: Record<string, unknown> };

/**
 * A RecoderGitService stub that implements `codeIntel` (the fusion seam) and
 * records every call. `respond` shapes the truthful ServiceResult per op.
 */
function recodergitImpactStub(opts: {
  enabled: boolean;
  calls?: IntelCall[];
  respond?: (op: string) => { available: boolean; result?: unknown; reason?: string };
}): RecoderGitService {
  return {
    isEnabled: () => opts.enabled,
    codeIntel: async (op: string, repoId: string, params: Record<string, unknown>) => {
      opts.calls?.push({ op, repoId, params });
      if (!opts.enabled) return { enabled: false };
      const r = opts.respond?.(op) ?? { available: true, result: { op, target: params.symbol } };
      return { enabled: true, op, repoId, ...r };
    },
  } as unknown as RecoderGitService;
}

function build(overrides: Partial<ConstructorParameters<typeof GithubModule>[0]> = {}): GithubModule {
  return new GithubModule({
    log,
    repoRoot: '/repo',
    runCli: fakeRun(() => undefined),
    recodergit: recodergitStub(false),
    resolveEngine: () => null,
    ...overrides,
  });
}

describe('GithubModule.health (single truthful GithubHealth)', () => {
  it('is down with truthful reasons when gh is absent AND the code-graph is disabled', async () => {
    const health = await build().health();
    expect(health.status).toBe('down');
    expect(health.gh.available).toBe(false);
    expect(health.gh.reason).toContain('gh CLI not available');
    expect(health.recodergitLib.available).toBe(false);
    expect(health.recodergitLib.reason).toContain('RECODER_CODE_GRAPH_ENABLED');
  });

  it('is degraded (never up) when gh works but the recodergit engine is unavailable', async () => {
    const health = await build({ runCli: ghUpRun() }).health();
    expect(health.status).toBe('degraded');
    expect(health.gh.available).toBe(true);
    expect(health.gh.detail).toContain('gh version');
    expect(health.recodergitLib.available).toBe(false);
  });

  it('is degraded when the engine is built+enabled but gh is missing (no gh → degraded)', async () => {
    const health = await build({
      recodergit: recodergitStub(true),
      resolveEngine: () => '/vendored/recodergit/dist/cli/index.js',
    }).health();
    expect(health.status).toBe('degraded');
    expect(health.gh.available).toBe(false);
    expect(health.recodergitLib.available).toBe(true);
  });

  it('reports gh unavailable when present but unauthenticated', async () => {
    const run = fakeRun((bin, args) => {
      if (args[0] === '--version') return { stdout: 'gh version 2.60.0' };
      return undefined; // auth status fails
    });
    const health = await build({ runCli: run }).health();
    expect(health.gh.available).toBe(false);
    expect(health.gh.reason).toContain('not authenticated');
  });

  it('is up ONLY when both facets are available', async () => {
    const health = await build({
      runCli: ghUpRun(),
      recodergit: recodergitStub(true),
      resolveEngine: () => '/vendored/recodergit/dist/cli/index.js',
    }).health();
    expect(health.status).toBe('up');
    expect(health.recodergitLib.detail).toContain('recodergit');
  });

  it('reports the flag-on-but-unbuilt engine truthfully', async () => {
    const health = await build({ recodergit: recodergitStub(true), resolveEngine: () => null }).health();
    expect(health.recodergitLib.available).toBe(false);
    expect(health.recodergitLib.reason).toContain('not built');
  });
});

describe('GithubModule.search', () => {
  it('parses gh JSON results', async () => {
    const calls: RecordedCall[] = [];
    const module = build({
      runCli: ghUpRun(
        () => ({ stdout: JSON.stringify([{ fullName: 'a/b', url: 'https://x', stargazersCount: 1 }]) }),
        calls,
      ),
    });
    const result = await module.search({ query: 'agent os', limit: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toHaveLength(1);
    }
    const searchCall = calls.find((call) => call.args[0] === 'search');
    expect(searchCall?.args).toContain('agent os');
    expect(searchCall?.args).toContain('5');
  });

  it('fails truthfully (unavailable) when gh is not installed', async () => {
    const result = await build().search({ query: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unavailable');
      expect(result.reason).toContain('gh CLI not found');
    }
  });

  it('rejects an empty query as bad_input', async () => {
    const result = await build().search({ query: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('bad_input');
  });
});

describe('GithubModule.openPR / comment / reviewPR', () => {
  it('openPR requires a title and a repoRoot', async () => {
    const noTitle = await build().openPR({ title: '' });
    expect(noTitle.ok).toBe(false);
    const noRoot = await build({ repoRoot: null }).openPR({ title: 't' });
    expect(noRoot.ok).toBe(false);
    if (!noRoot.ok) expect(noRoot.reason).toContain('repoRoot');
  });

  it('openPR returns the PR URL gh prints', async () => {
    const module = build({
      runCli: ghUpRun(() => ({ stdout: 'https://github.com/a/b/pull/7\n' })),
    });
    const result = await module.openPR({ title: 'feat: x', body: 'b', base: 'main' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.url).toBe('https://github.com/a/b/pull/7');
  });

  it('comment posts via gh pr comment and fails truthfully without gh', async () => {
    const calls: RecordedCall[] = [];
    const module = build({ runCli: ghUpRun(() => ({ stdout: 'https://c' }), calls) });
    const posted = await module.comment({ pr: 7, body: 'looks good' });
    expect(posted.ok).toBe(true);
    expect(calls.some((call) => call.args[0] === 'pr' && call.args[1] === 'comment')).toBe(true);

    const missing = await build().comment({ pr: 7, body: 'x' });
    expect(missing.ok).toBe(false);
  });

  it('reviewPR returns pr view JSON + diff, degrading the diff truthfully', async () => {
    const withDiff = build({
      runCli: ghUpRun((_bin, args) => {
        if (args[1] === 'view') return { stdout: JSON.stringify({ number: 7, title: 't' }) };
        if (args[1] === 'diff') return { stdout: 'diff --git a b' };
        return {};
      }),
    });
    const okResult = await withDiff.reviewPR({ pr: 7 });
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect((okResult.value.pr as { number: number }).number).toBe(7);
      expect(okResult.value.diff).toContain('diff --git');
    }

    const diffFails = build({
      runCli: ghUpRun((_bin, args) => {
        if (args[1] === 'view') return { stdout: JSON.stringify({ number: 7 }) };
        return undefined; // diff fails
      }),
    });
    const degraded = await diffFails.reviewPR({ pr: 7 });
    expect(degraded.ok).toBe(true);
    if (degraded.ok) {
      expect(degraded.value.diff).toBeNull();
      expect(degraded.value.diffUnavailable).toBeTruthy();
    }
  });
});

describe('GithubModule.reviewPR — recodergit blast-radius fusion', () => {
  const PR_DIFF = [
    'diff --git a/src/pay.ts b/src/pay.ts',
    '--- a/src/pay.ts',
    '+++ b/src/pay.ts',
    '@@ -10,6 +10,8 @@ export class Payments {',
    '   async settle() {}',
    '+  async computePayout(userId: string) {',
    '+    return charge(userId);',
    '+  }',
  ].join('\n');

  function ghWithDiff(calls: RecordedCall[] = []): GithubCliRunner {
    return ghUpRun((_bin, args) => {
      if (args[1] === 'view') return { stdout: JSON.stringify({ number: 7, title: 't' }) };
      if (args[1] === 'diff') return { stdout: PR_DIFF };
      return {};
    }, calls);
  }

  it('FIRES the engine: extracts changed symbols and annotates callers + callees', async () => {
    const intel: IntelCall[] = [];
    const module = build({
      runCli: ghWithDiff(),
      recodergit: recodergitImpactStub({ enabled: true, calls: intel }),
    });
    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The diff was still returned untouched alongside the new annotation.
    expect(result.value.diff).toContain('computePayout');
    const impact = result.value.impact;
    expect(impact.available).toBe(true);
    expect(impact.changedSymbols).toContain('computePayout');

    // The fusion actually invoked the engine in BOTH blast-radius directions.
    const ops = intel.map((c) => c.op);
    expect(ops).toContain('find_references'); // upstream callers/dependents
    expect(ops).toContain('call_graph'); // downstream callees/dependencies
    // …targeting an extracted symbol, against the on-disk checkout.
    const payoutCalls = intel.filter((c) => c.params.symbol === 'computePayout');
    expect(payoutCalls.map((c) => c.op).sort()).toEqual(['call_graph', 'find_references']);
    expect(payoutCalls.every((c) => c.params.repo === '/repo')).toBe(true);

    // The per-symbol annotation carries both real readings (never fabricated).
    const payout = impact.symbols.find((s) => s.symbol === 'computePayout');
    expect(payout?.references).toEqual({ op: 'find_references', target: 'computePayout' });
    expect(payout?.callGraph).toEqual({ op: 'call_graph', target: 'computePayout' });
  });

  it('degrades TRUTHFULLY when the code-graph is disabled — review still returns, no engine calls', async () => {
    const intel: IntelCall[] = [];
    const module = build({
      runCli: ghWithDiff(),
      recodergit: recodergitImpactStub({ enabled: false, calls: intel }),
    });
    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff).toContain('computePayout'); // review NOT blocked
    expect(result.value.impact.available).toBe(false);
    expect(result.value.impact.reason).toMatch(/disabled/i);
    expect(intel).toHaveLength(0); // isEnabled() gate short-circuits the fan-out
  });

  it('degrades truthfully when the engine reports the repo is not indexed', async () => {
    const module = build({
      runCli: ghWithDiff(),
      recodergit: recodergitImpactStub({
        enabled: true,
        respond: () => ({ available: false, reason: 'repo not indexed (call index/connect first)' }),
      }),
    });
    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const impact = result.value.impact;
    expect(impact.available).toBe(false);
    expect(impact.reason).toMatch(/not indexed/i);
    // Symbols were still extracted + attempted; each carries the truthful reason.
    expect(impact.changedSymbols.length).toBeGreaterThan(0);
    expect(impact.symbols.every((s) => s.references === null && s.callGraph === null)).toBe(true);
  });

  it('skips truthfully when the diff is unavailable (no fabricated impact)', async () => {
    const module = build({
      runCli: ghUpRun((_bin, args) => {
        if (args[1] === 'view') return { stdout: JSON.stringify({ number: 7 }) };
        return undefined; // diff fails
      }),
      recodergit: recodergitImpactStub({ enabled: true }),
    });
    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff).toBeNull();
    expect(result.value.impact.available).toBe(false);
    expect(result.value.impact.reason).toMatch(/no diff/i);
  });
});

describe('extractChangedSymbols', () => {
  it('pulls declared names from hunk context and added/removed lines across languages', () => {
    const diff = [
      '@@ -1,2 +1,4 @@ export class Billing {',
      '+function computeTax(amount) {}',
      '+  async settleInvoice(id: string): Promise<void> {',
      '-const legacyHandler = () => {}',
      '+def reconcile(ledger):',
      '+func ChargeCard(c *Card) error {',
      '+fn verify_signature(sig: &str) {',
      '   unchanged line ignored',
    ].join('\n');
    const symbols = extractChangedSymbols(diff);
    expect(symbols).toContain('Billing'); // hunk-header class context
    expect(symbols).toContain('computeTax');
    expect(symbols).toContain('settleInvoice');
    expect(symbols).toContain('legacyHandler');
    expect(symbols).toContain('reconcile');
    expect(symbols).toContain('ChargeCard');
    expect(symbols).toContain('verify_signature');
    // Keywords and unchanged context never leak in as symbols.
    expect(symbols).not.toContain('function');
    expect(symbols).not.toContain('unchanged');
  });

  it('de-duplicates and returns [] for a diff with no declarations', () => {
    expect(extractChangedSymbols('@@ -1 +1 @@\n+  x = x + 1\n-  y = 2')).toEqual([]);
  });
});

describe('GithubModule.analyzeRepo / domainMap (recodergit seam)', () => {
  it('fails with code=disabled when the code-graph flag is off', async () => {
    const result = await build().analyzeRepo({ repoRoot: '/repo', repoId: 'r1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('disabled');
  });

  it('returns the truthful index state when the service is enabled', async () => {
    const module = build({ recodergit: recodergitStub(true) });
    const result = await module.analyzeRepo({ repoRoot: '/repo', repoId: 'r1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('indexed');
      expect(result.value.repoId).toBe('r1');
    }
  });

  it('domainMap validates input and passes the projected map through', async () => {
    const bad = await build().domainMap('');
    expect(bad.ok).toBe(false);
    const result = await build({ recodergit: recodergitStub(true) }).domainMap('r1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.domains).toEqual([{ name: 'core' }]);
  });
});
