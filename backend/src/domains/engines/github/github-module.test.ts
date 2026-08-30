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
import type { CliResult, RunCliOptions } from '../adapters/cli/cli-exec.js';
import type { RecoderGitService } from '../recodergit-service.js';
import { GithubModule, type GithubCliRunner, extractChangedSymbolLocations, extractChangedSymbols, extractLinkedIssueNumbers } from './github-module.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

type RecordedCall = { bin: string; args: readonly string[]; options?: RunCliOptions };

/** Fake bounded runner: handler returns a partial result, undefined = ENOENT. */
function fakeRun(
  handler: (bin: string, args: readonly string[], options?: RunCliOptions) => Partial<CliResult> | undefined,
  calls: RecordedCall[] = [],
): GithubCliRunner {
  return async (bin, args, options) => {
    calls.push({ bin, args, options });
    const partial = handler(bin, args, options);
    if (!partial) {
      return { ok: false, code: null, stdout: '', stderr: '', reason: `spawn ${bin} ENOENT` };
    }
    return { ok: true, code: 0, stdout: '', stderr: '', ...partial };
  };
}

/** gh runner where --version and auth status succeed; other calls delegated. */
function ghUpRun(
  handler: (bin: string, args: readonly string[], options?: RunCliOptions) => Partial<CliResult> | undefined = () => ({}),
  calls: RecordedCall[] = [],
): GithubCliRunner {
  return fakeRun((bin, args, options) => {
    if (args[0] === '--version') return { stdout: 'gh version 2.60.0 (2026-01-01)\n' };
    if (args[0] === 'auth' && args[1] === 'status') return { stdout: 'Logged in' };
    return handler(bin, args, options);
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
      const r = opts.respond?.(op) ?? {
        available: true,
        result: {
          target: { name: params.symbol, filePath: 'src/pay.ts' },
          direction: op === 'find_references' ? 'upstream' : 'downstream',
          impactedCount: 2,
          risk: op === 'find_references' ? 'HIGH' : 'MEDIUM',
          partial: false,
          affected_processes: [
            { id: 'checkout', label: 'Checkout settlement', processType: 'business' },
          ],
          coChanges: [{
            filePath: 'src/config.ts',
            relationType: 'CO_CHANGED_WITH',
            commits: 4,
            confidence: 0.8,
            processes: [],
          }],
          crossRepository: [{
            repoId: 'acme__checkout',
            filePath: 'src/checkout.ts',
            ecosystem: 'npm',
            packageName: '@acme/payments',
            importSpecifier: '@acme/payments/charge',
            relationType: 'CONSUMED_BY',
            confidence: 1,
          }],
          byDepth: {
            1: op === 'find_references'
              ? [{
                  name: 'settleAll',
                  filePath: 'src/jobs/settle.ts',
                  relationType: 'CALLS',
                  processes: [{ id: 'checkout', label: 'Checkout settlement' }],
                }]
              : [
                  { name: 'charge', filePath: 'src/billing/charge.ts', relationType: 'CALLS' },
                  { name: 'charges payout', filePath: 'src/pay.test.ts', relationType: 'TESTS' },
                ],
          },
        },
      };
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
  it('lists open pull requests with the head SHA revision cursor', async () => {
    const calls: RecordedCall[] = [];
    const module = build({
      runCli: ghUpRun((_bin, args) => {
        if (args[1] === 'list') {
          return {
            stdout: JSON.stringify([{
              number: 17,
              title: 'Fix race',
              url: 'https://github.com/a/b/pull/17',
              headRefOid: 'abc123',
              baseRefName: 'main',
              headRefName: 'fix/race',
              isDraft: false,
              updatedAt: '2026-08-30T12:00:00Z',
              author: { login: 'dev' },
            }]),
          };
        }
        return {};
      }, calls),
    });

    const result = await module.listOpenPullRequests({ repoRoot: '/repo', limit: 20 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pullRequests[0]).toMatchObject({
        number: 17,
        headSha: 'abc123',
        author: 'dev',
      });
    }
    expect(calls.find((call) => call.args[1] === 'list')?.args).toContainEqual(
      expect.stringContaining('headRefOid,baseRefName,headRefName,isDraft,updatedAt,author'),
    );
  });

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

  it('submits the human-selected native review event', async () => {
    const calls: RecordedCall[] = [];
    const module = build({ runCli: ghUpRun(() => ({ stdout: '' }), calls) });

    const result = await module.submitReview({
      pr: 17,
      event: 'request_changes',
      body: 'The settlement can run twice.',
    });

    expect(result).toEqual({ ok: true, value: { pr: '17', event: 'request_changes', inlineCount: 0 } });
    expect(calls.find((call) => call.args[1] === 'review')?.args).toEqual([
      'pr',
      'review',
      '17',
      '--request-changes',
      '--body',
      'The settlement can run twice.',
    ]);
  });

  it('submits selected findings as one head-bound native inline review', async () => {
    const calls: RecordedCall[] = [];
    const module = build({ runCli: ghUpRun(() => ({ stdout: '{"id":1}' }), calls) });

    const result = await module.submitReview({
      pr: 17,
      event: 'request_changes',
      body: 'Two reviewers found this race.',
      commitId: 'abc123',
      comments: [{ path: 'src/pay.ts', line: 42, body: 'The check and write are not atomic.' }],
    });

    expect(result).toEqual({ ok: true, value: { pr: '17', event: 'request_changes', inlineCount: 1 } });
    const call = calls.find((candidate) => candidate.args[0] === 'api');
    expect(call?.args).toEqual([
      'api',
      'repos/{owner}/{repo}/pulls/17/reviews',
      '--method',
      'POST',
      '--input',
      '-',
    ]);
    expect(JSON.parse(call?.options?.stdin ?? '{}')).toEqual({
      commit_id: 'abc123',
      body: 'Two reviewers found this race.',
      event: 'REQUEST_CHANGES',
      comments: [{ path: 'src/pay.ts', line: 42, side: 'RIGHT', body: 'The check and write are not atomic.' }],
    });
  });

  it('reads paginated resolved and outdated review-thread state', async () => {
    const payload = [{
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [{
                id: 'PRRT_1',
                path: 'src/pay.ts',
                line: null,
                originalLine: 42,
                isResolved: true,
                isOutdated: true,
                resolvedBy: { login: 'maintainer' },
                comments: { nodes: [{ body: 'Fixed.\n\n<!-- recoder-finding:src%2Fpay.ts%3A42%3Asettlement-race -->', url: 'https://github.com/a/b/pull/17#discussion_r1' }] },
              }],
            },
          },
        },
      },
    }];
    const module = build({ runCli: ghUpRun((_bin, args) => args[0] === 'api' ? { stdout: JSON.stringify(payload) } : {}) });

    const result = await module.listReviewThreads({ pr: 17 });

    expect(result).toEqual({ ok: true, value: { threads: [{
      id: 'PRRT_1',
      path: 'src/pay.ts',
      line: 42,
      isResolved: true,
      isOutdated: true,
      rootBody: 'Fixed.\n\n<!-- recoder-finding:src%2Fpay.ts%3A42%3Asettlement-race -->',
      url: 'https://github.com/a/b/pull/17#discussion_r1',
      resolvedBy: 'maintainer',
    }] } });
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

  it('resolves bounded same-repository issue requirements without failing the review', async () => {
    const calls: RecordedCall[] = [];
    const module = build({
      readTextFile: async (filePath) => filePath.endsWith('.recoder/review-rules.json')
        ? JSON.stringify({
            version: 1,
            rules: [{ id: 'migration-safety', level: 'required', text: 'Schema changes require a migration.', check: 'Backend types' }],
          })
        : null,
      runCli: ghUpRun((_bin, args) => {
        if (args[0] === 'pr' && args[1] === 'view') return { stdout: JSON.stringify({
          number: 7,
          title: 'Fix settlement',
          url: 'https://github.com/acme/repo/pull/7',
          body: [
            'Fixes #11 and #12',
            'Related issue: #13',
            'Casual mention #99',
            'https://github.com/acme/repo/issues/14',
            'https://github.com/other/repo/issues/15',
          ].join('\n'),
        }) };
        if (args[0] === 'pr' && args[1] === 'diff') return { stdout: 'diff --git a/src/pay.ts b/src/pay.ts' };
        if (args[0] === 'issue' && args[1] === 'view') {
          const number = Number(args[2]);
          if (number === 12) return undefined;
          return { stdout: JSON.stringify({
            number,
            title: `Requirement ${number}`,
            body: `Acceptance criteria for ${number}`,
            state: number === 13 ? 'CLOSED' : 'OPEN',
            url: `https://github.com/acme/repo/issues/${number}`,
            labels: [{ name: 'product' }],
          }) };
        }
        return {};
      }, calls),
    });

    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requirements.issues).toEqual([
      expect.objectContaining({ number: 11, state: 'OPEN', labels: ['product'] }),
      expect.objectContaining({ number: 13, state: 'CLOSED' }),
      expect.objectContaining({ number: 14, state: 'OPEN' }),
    ]);
    expect(result.value.requirements.unavailable).toEqual([
      expect.objectContaining({ number: 12 }),
    ]);
    expect(result.value.reviewRules).toEqual({
      source: '.recoder/review-rules.json',
      rules: [{
        id: 'migration-safety',
        level: 'required',
        text: 'Schema changes require a migration.',
        source: '.recoder/review-rules.json',
        check: 'Backend types',
      }],
    });
    expect(calls.filter((call) => call.args[0] === 'issue').map((call) => call.args[2])).toEqual(['11', '12', '13', '14']);
  });

  it('surfaces an invalid explicit rule file instead of silently falling through', async () => {
    const module = build({
      readTextFile: async (filePath) => filePath.endsWith('.json')
        ? '{not-json'
        : '- [required] This fallback must not hide the invalid primary file.',
      runCli: ghUpRun((_bin, args) => {
        if (args[0] === 'pr' && args[1] === 'view') return { stdout: JSON.stringify({ number: 7, body: '' }) };
        if (args[0] === 'pr' && args[1] === 'diff') return { stdout: '' };
        return {};
      }),
    });
    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reviewRules).toEqual({
      source: '.recoder/review-rules.json',
      rules: [],
      unavailable: '.recoder/review-rules.json contains no valid required/advisory review rules',
    });
  });
});

describe('extractLinkedIssueNumbers', () => {
  it('ignores casual and cross-repository references', () => {
    expect(extractLinkedIssueNumbers([
      'Fixes #2 and acme/repo#3',
      'Fixes other/repo#4',
      'Casual #5',
      'https://github.com/acme/repo/issues/6',
      'https://github.com/other/repo/issues/7',
    ].join('\n'), 'https://github.com/acme/repo/pull/1')).toEqual([2, 3, 6]);
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
      if (args[1] === 'view') return {
        stdout: JSON.stringify({
          number: 7,
          title: 't',
          url: 'https://github.com/Acme/Widget/pull/7',
        }),
      };
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
    expect(payoutCalls.every((c) => c.repoId === 'acme__widget')).toBe(true);
    expect(payoutCalls.every((c) =>
      Array.isArray(c.params.repoAliases) && c.params.repoAliases.includes('repo')
    )).toBe(true);
    expect(payoutCalls.every((c) => c.params.filePath === 'src/pay.ts')).toBe(true);
    expect(payoutCalls.every((c) => c.params.includeTests === true)).toBe(true);
    expect(payoutCalls.every((c) => c.params.limit === 20 && c.params.maxDepth === 3)).toBe(true);

    // The per-symbol annotation carries both real readings (never fabricated).
    const payout = impact.symbols.find((s) => s.symbol === 'computePayout');
    expect(payout?.references).toMatchObject({ direction: 'upstream', risk: 'HIGH' });
    expect(payout?.callGraph).toMatchObject({ direction: 'downstream', risk: 'MEDIUM' });
    expect(impact.source).toBe('recodergit');
    expect(impact.scope).toBe('symbol');
    expect(impact.risk).toBe('HIGH');
    expect(impact.partial).toBe(false);
    expect(impact.files.map((file) => file.path)).toEqual([
      'src/billing/charge.ts',
      'src/config.ts',
      'src/jobs/settle.ts',
      'src/pay.test.ts',
    ]);
    expect(impact.files.find((file) => file.path === 'src/config.ts')).toMatchObject({
      relationTypes: ['CO_CHANGED_WITH'],
      directions: [],
      coChange: { commits: 4, confidence: 0.8 },
    });
    expect(impact.tests).toHaveLength(1);
    expect(impact.tests[0]).toMatchObject({ path: 'src/pay.test.ts', isTest: true });
    expect(impact.processes).toEqual([
      { id: 'checkout', label: 'Checkout settlement', processType: 'business' },
    ]);
    expect(impact.consumers).toEqual([{
      repoId: 'acme__checkout',
      path: 'src/checkout.ts',
      ecosystem: 'npm',
      packageName: '@acme/payments',
      importSpecifier: '@acme/payments/charge',
      relationType: 'CONSUMED_BY',
    }]);
    expect(impact.summary).toEqual({
      impactedFiles: 4,
      affectedTests: 1,
      upstreamFiles: 1,
      downstreamFiles: 2,
      affectedProcesses: 1,
      coChangedFiles: 1,
      crossRepositoryFiles: 1,
      consumerRepositories: 1,
    });
  });

  it('preserves exact cross-repository totals when the returned consumer rows are bounded', async () => {
    const module = build({
      runCli: ghWithDiff(),
      recodergit: recodergitImpactStub({
        enabled: true,
        respond: (op) => ({
          available: true,
          result: {
            scope: 'file-import-graph',
            direction: op === 'find_references' ? 'upstream' : 'downstream',
            risk: 'CRITICAL',
            partial: true,
            summary: { cross_repository_files: 177, consumer_repositories: 1 },
            affected_processes: [],
            byDepth: {},
            coChanges: [],
            crossRepository: [{
              repoId: 'recoder__backend',
              filePath: 'src/bootstrap/index.ts',
              ecosystem: 'npm',
              packageName: '@recoder/agent-os',
              importSpecifier: '@recoder/agent-os',
              relationType: 'CONSUMED_BY',
              confidence: 1,
            }],
          },
        }),
      }),
    });

    const result = await module.reviewPR({ pr: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.impact).toMatchObject({
      available: true,
      partial: true,
      consumers: [{ repoId: 'recoder__backend', path: 'src/bootstrap/index.ts' }],
      summary: { crossRepositoryFiles: 177, consumerRepositories: 1 },
    });
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

  it('keeps destination file provenance for same-named declarations in separate files', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '+export function settle() {}',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1 +1 @@',
      '+export function settle() {}',
    ].join('\n');
    expect(extractChangedSymbolLocations(diff)).toEqual([
      { symbol: 'settle', filePath: 'src/a.ts' },
      { symbol: 'settle', filePath: 'src/b.ts' },
    ]);
    expect(extractChangedSymbols(diff)).toEqual(['settle']);
  });

  it('keeps Python, Go, and Rust destination paths for the packaged file graph', () => {
    const diff = [
      'diff --git a/python/pay.py b/python/pay.py',
      '+++ b/python/pay.py',
      '@@ -1 +1 @@',
      '+def settle_invoice():',
      'diff --git a/go/pay.go b/go/pay.go',
      '+++ b/go/pay.go',
      '@@ -1 +1 @@',
      '+func SettleInvoice() error { return nil }',
      'diff --git a/rust/pay.rs b/rust/pay.rs',
      '+++ b/rust/pay.rs',
      '@@ -1 +1 @@',
      '+pub fn settle_invoice() {}',
    ].join('\n');
    expect(extractChangedSymbolLocations(diff)).toEqual([
      { symbol: 'settle_invoice', filePath: 'python/pay.py' },
      { symbol: 'SettleInvoice', filePath: 'go/pay.go' },
      { symbol: 'settle_invoice', filePath: 'rust/pay.rs' },
    ]);
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
