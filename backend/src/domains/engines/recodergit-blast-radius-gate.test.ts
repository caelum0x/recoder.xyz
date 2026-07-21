/**
 * C3 regression gate — recodergit PR blast-radius fusion (engines half).
 *
 * Locks the SHIPPED (Wave 4) invariant that `GithubModule.reviewPR` folds a real
 * blast-radius annotation onto the review payload via the recodergit code-graph —
 * `annotateImpact` (`find_references` upstream + `call_graph` downstream per changed
 * symbol) — and that the PolyForm gate holds:
 *
 *  (1) code-graph ENABLED + indexed ⇒ `impact.available === true`, the changed
 *      symbols are extracted from the diff, and the engine is invoked in BOTH
 *      blast-radius directions (callers + callees) against the on-disk checkout.
 *  (1') `RECODER_CODE_GRAPH_ENABLED` OFF ⇒ the review STILL returns (never blocked),
 *      `impact.available === false` with a truthful reason, and ZERO engine calls —
 *      no fabricated symbol, edge, or blast-radius. The code-graph is never a hard
 *      dependency.
 *
 * All IO is injected — no real gh, git, or engine process is ever spawned.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../shared/logger.js';
import type { CliResult } from './adapters/cli/cli-exec.js';
import type { RecoderGitService } from './recodergit-service.js';
import { GithubModule, type GithubCliRunner } from './github/github-module.js';

const log = {
  warn() {},
  info() {},
  debug() {},
  error() {},
  child: () => log,
} as unknown as Logger;

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

/** Recorded code-intel call for the blast-radius fusion assertions. */
type IntelCall = { op: string; repoId: string; params: Record<string, unknown> };

/** A RecoderGitService stub implementing the `codeIntel` fusion seam; records every call. */
function recodergitImpactStub(opts: { enabled: boolean; calls?: IntelCall[] }): RecoderGitService {
  return {
    isEnabled: () => opts.enabled,
    codeIntel: async (op: string, repoId: string, params: Record<string, unknown>) => {
      opts.calls?.push({ op, repoId, params });
      if (!opts.enabled) return { enabled: false };
      return { enabled: true, op, repoId, available: true, result: { op, target: params.symbol } };
    },
  } as unknown as RecoderGitService;
}

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

function build(recodergit: RecoderGitService, runCli: GithubCliRunner): GithubModule {
  return new GithubModule({
    log,
    repoRoot: '/repo',
    runCli,
    recodergit,
    resolveEngine: () => null,
  });
}

describe('C3 gate — recodergit PR blast-radius still attaches impact (SHIPPED Wave 4)', () => {
  it('ENABLED + indexed ⇒ impact attaches with callers + callees for each changed symbol', async () => {
    const intel: IntelCall[] = [];
    const result = await build(
      recodergitImpactStub({ enabled: true, calls: intel }),
      ghWithDiff(),
    ).reviewPR({ pr: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impact = result.value.impact;
    expect(impact.available).toBe(true);
    expect(impact.changedSymbols).toContain('computePayout');

    // Both blast-radius directions were driven against the on-disk checkout.
    const payoutCalls = intel.filter((c) => c.params.symbol === 'computePayout');
    expect(payoutCalls.map((c) => c.op).sort()).toEqual(['call_graph', 'find_references']);
    expect(payoutCalls.every((c) => c.params.repo === '/repo')).toBe(true);

    // The per-symbol annotation carries both real readings (never fabricated).
    const payout = impact.symbols.find((s) => s.symbol === 'computePayout');
    expect(payout?.references).toEqual({ op: 'find_references', target: 'computePayout' });
    expect(payout?.callGraph).toEqual({ op: 'call_graph', target: 'computePayout' });
  });

  it('flag-off ⇒ review still returns, impact.available=false with a real reason, ZERO engine calls', async () => {
    const intel: IntelCall[] = [];
    const result = await build(
      recodergitImpactStub({ enabled: false, calls: intel }),
      ghWithDiff(),
    ).reviewPR({ pr: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Review is NEVER blocked by the code-graph being off.
    expect(result.value.diff).toContain('computePayout');
    // PolyForm gate: truthful unavailability, no fabricated blast-radius.
    expect(result.value.impact.available).toBe(false);
    expect(result.value.impact.reason).toMatch(/disabled/i);
    // isEnabled() short-circuits the fan-out — the engine is never touched.
    expect(intel).toHaveLength(0);
  });
});
