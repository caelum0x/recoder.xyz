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
import { GithubModule, type GithubCliRunner } from './github-module.js';

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
