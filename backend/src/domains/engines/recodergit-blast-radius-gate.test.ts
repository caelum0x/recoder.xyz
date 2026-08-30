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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Logger } from '../../shared/logger.js';
import type { CliResult } from './adapters/cli/cli-exec.js';
import { createRecoderGitService, type RecoderGitService } from './recodergit-service.js';
import { createPermissiveImpactFallback } from './permissive-code-search.js';
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

function ghWithDiff(calls: RecordedCall[] = [], diff = PR_DIFF): GithubCliRunner {
  return ghUpRun((_bin, args) => {
    if (args[1] === 'view') return { stdout: JSON.stringify({ number: 7, title: 't' }) };
    if (args[1] === 'diff') return { stdout: diff };
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

  it('installed path carries symbol calls and process membership without the donor engine', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'recoder-permissive-impact-'));
    try {
      await mkdir(path.join(repoRoot, 'src', 'billing'), { recursive: true });
      await mkdir(path.join(repoRoot, 'src', 'jobs'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@app/*': ['src/*'], '@billing/*': ['src/billing/*'] },
          },
        }),
      );
      await writeFile(
        path.join(repoRoot, 'src', 'pay.ts'),
        "import { charge } from '@billing/charge';\nexport const computePayout = () => charge();\n",
      );
      await writeFile(path.join(repoRoot, 'src', 'billing', 'charge.ts'), 'export const charge = () => 1;\n');
      await writeFile(
        path.join(repoRoot, 'src', 'jobs', 'settle.ts'),
        "import { computePayout } from '@app/pay';\nexport const settle = () => computePayout();\n",
      );
      await writeFile(
        path.join(repoRoot, 'src', 'pay.test.ts'),
        "import { computePayout } from '@app/pay';\nexport const payout = computePayout();\n",
      );
      await writeFile(
        path.join(repoRoot, 'src', 'server.ts'),
        [
          "import { settle } from '@app/jobs/settle';",
          'const app = { get: (..._args: unknown[]) => undefined, listen: (_port: number) => undefined };',
          'export function handleSettlement() { return settle(); }',
          "app.get('/settle', handleSettlement);",
          'app.listen(3000);',
        ].join('\n'),
      );
      const service = createRecoderGitService({
        isEnabled: () => true,
        loadEngineLib: async () => null,
        fallbackImpact: createPermissiveImpactFallback(),
        logger: { error() {} },
      });
      const module = new GithubModule({
        log,
        repoRoot,
        runCli: ghWithDiff(),
        recodergit: service,
        resolveEngine: () => null,
      });
      const result = await module.reviewPR({ pr: 7 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.impact).toMatchObject({
        available: true,
        source: 'recodergit',
        scope: 'mixed',
        processes: [
          { label: 'GET /settle', processType: 'route', filePath: 'src/server.ts' },
          { label: 'Server src/server.ts', processType: 'server', filePath: 'src/server.ts' },
        ],
        summary: {
          impactedFiles: 4,
          affectedTests: 1,
          upstreamFiles: 3,
          downstreamFiles: 1,
          affectedProcesses: 2,
        },
      });
      const charge = result.value.impact.files.find((file) => file.path === 'src/billing/charge.ts');
      expect(charge?.symbols).toContain('charge');
      expect(charge?.relationTypes).toContain('CALLS');
      const settle = result.value.impact.files.find((file) => file.path === 'src/jobs/settle.ts');
      expect(settle?.symbols).toContain('settle');
      expect(settle?.relationTypes).toContain('CALLED_BY');
      expect(result.value.impact.files.find((file) => file.path === 'src/pay.test.ts')).toMatchObject({
        isTest: true,
        directions: ['upstream'],
      });
      expect(result.value.impact.files.find((file) => file.path === 'src/server.ts')?.symbols)
        .toContain('handleSettlement');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('installed path carries Python, Go, and Rust impact when the donor is absent', async () => {
    const fixtures = [
      {
        name: 'python',
        target: 'python/lib/shop/billing.py',
        symbol: 'charge',
        declaration: 'def charge():',
        files: {
          'python/pyproject.toml': '[tool.setuptools]\npackage-dir = {"" = "lib"}\n',
          'python/lib/shop/rates.py': 'def rate():\n    return 1\n',
          'python/lib/shop/billing.py': 'from .rates import rate\ndef charge():\n    return rate()\n',
          'python/app/pay.py': 'from shop.billing import charge\ndef compute():\n    return charge()\n',
          'python/app/jobs.py': 'from .pay import compute\ndef settle():\n    return compute()\n',
          'python/tests/billing_test.py': 'from shop.billing import charge\ndef test_charge():\n    assert charge()\n',
        },
        upstream: ['python/app/pay.py', 'python/app/jobs.py', 'python/tests/billing_test.py'],
        downstream: ['python/lib/shop/rates.py'],
        test: 'python/tests/billing_test.py',
        summary: { impactedFiles: 4, upstreamFiles: 3 },
      },
      {
        name: 'go',
        target: 'go/shared/contracts/billing/billing.go',
        symbol: 'Charge',
        declaration: 'func Charge() int { return rates.Rate() }',
        files: {
          'go/go.work': 'go 1.22\nuse (\n  ./services/shop\n  ./shared/contracts\n  ./shared/private\n)\nreplace example.com/private => ./shared/private\n',
          'go/services/shop/go.mod': 'module example.com/shop\nreplace example.com/contracts => ../../shared/contracts\n',
          'go/shared/contracts/go.mod': 'module local/contracts\n',
          'go/shared/private/go.mod': 'module local/private\n',
          'go/shared/private/rates/rates.go': 'package rates\nfunc Rate() int { return 1 }\n',
          'go/shared/contracts/billing/billing.go': 'package billing\nimport "example.com/private/rates"\nfunc Charge() int { return rates.Rate() }\n',
          'go/services/shop/internal/pay/pay.go': 'package pay\nimport "example.com/contracts/billing"\nfunc Compute() int { return billing.Charge() }\n',
          'go/services/shop/cmd/main.go': 'package main\nimport "example.com/shop/internal/pay"\nfunc main() { pay.Compute() }\n',
          'go/services/shop/internal/billing/billing_test.go': 'package billing_test\nimport "example.com/contracts/billing"\nfunc TestCharge() { billing.Charge() }\n',
        },
        upstream: [
          'go/services/shop/internal/pay/pay.go',
          'go/services/shop/cmd/main.go',
          'go/services/shop/internal/billing/billing_test.go',
        ],
        downstream: ['go/shared/private/rates/rates.go'],
        test: 'go/services/shop/internal/billing/billing_test.go',
        summary: { impactedFiles: 4, upstreamFiles: 3 },
      },
      {
        name: 'rust',
        target: 'rust/src/generated/billing_impl.rs',
        symbol: 'charge',
        declaration: 'pub fn charge() -> i32 { rate() }',
        files: {
          'rust/Cargo.toml': '[package]\nname = "shop-core"\nversion = "0.1.0"\n',
          'rust/src/lib.rs': '#[path = "generated/billing_impl.rs"]\npub mod billing;\npub mod pay;\npub mod rates;\n',
          'rust/src/rates.rs': 'pub fn rate() -> i32 { 1 }\n',
          'rust/src/generated/billing_impl.rs': 'use crate::rates::rate;\npub fn charge() -> i32 { rate() }\n',
          'rust/src/pay.rs': 'use crate::billing::charge;\npub fn compute() -> i32 { charge() }\n',
          'rust/tests/billing.rs': 'use shop_core::billing::charge;\n#[test]\nfn charges() { charge(); }\n',
        },
        upstream: ['rust/src/pay.rs', 'rust/tests/billing.rs'],
        downstream: ['rust/src/rates.rs'],
        test: 'rust/tests/billing.rs',
        summary: { impactedFiles: 3, upstreamFiles: 2 },
      },
    ] as const;

    for (const fixture of fixtures) {
      const repoRoot = await mkdtemp(path.join(tmpdir(), `recoder-${fixture.name}-impact-`));
      try {
        for (const [relative, content] of Object.entries(fixture.files)) {
          const absolute = path.join(repoRoot, relative);
          await mkdir(path.dirname(absolute), { recursive: true });
          await writeFile(absolute, content);
        }
        const diff = [
          `diff --git a/${fixture.target} b/${fixture.target}`,
          `--- a/${fixture.target}`,
          `+++ b/${fixture.target}`,
          '@@ -1 +1 @@',
          `+${fixture.declaration}`,
        ].join('\n');
        const service = createRecoderGitService({
          isEnabled: () => true,
          loadEngineLib: async () => null,
          fallbackImpact: createPermissiveImpactFallback(),
          logger: { error() {} },
        });
        const result = await new GithubModule({
          log,
          repoRoot,
          runCli: ghWithDiff([], diff),
          recodergit: service,
          resolveEngine: () => null,
        }).reviewPR({ pr: 7 });
        expect(result.ok, fixture.name).toBe(true);
        if (!result.ok) continue;
        expect(result.value.impact, fixture.name).toMatchObject({
          available: true,
          scope: 'symbol',
          changedSymbols: [fixture.symbol],
          summary: {
            ...fixture.summary,
            affectedTests: 1,
            downstreamFiles: 1,
          },
        });
        for (const expected of fixture.upstream) {
          expect(result.value.impact.files.find((file) => file.path === expected)?.directions, `${fixture.name}:${expected}`)
            .toContain('upstream');
        }
        for (const expected of fixture.downstream) {
          expect(result.value.impact.files.find((file) => file.path === expected)?.directions, `${fixture.name}:${expected}`)
            .toContain('downstream');
        }
        expect(result.value.impact.tests.map((file) => file.path)).toContain(fixture.test);
      } finally {
        await rm(repoRoot, { recursive: true, force: true });
      }
    }
  });
});
