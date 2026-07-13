/**
 * GitHubModule composition tests. Every absorbed engine is mocked at its seam:
 *   - the recodergit code-intel lib (loadEngineLib → runFullAnalysis / callTool)
 *   - the gh CLI runner (GhRunner)
 *   - the pr-swarm-review engine (PrReviewEngine)
 * so no real gh CLI, clone, index, or network is ever touched. The tests prove
 * each interface verb plus truthful, degrade-safe health.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGitHubModule, getGitHubModule, setGitHubModule, resetGitHubModule } from './index';
import type { GitHubModule } from './types';
import type { GhRunner } from './ops';
import type { PrReviewEngine, ReviewPullRequestInput, ReviewPullRequestResult } from './deps';
import { createRecoderGitService, type EngineLib } from '../../agent-os/recodergit-service';

// ─── fakes ────────────────────────────────────────────────────────────────────

/** A recodergit lib seam: typed analyze stats + a route_map callTool. */
function fakeEngineLib(): EngineLib {
  return {
    runFullAnalysis: async () => ({
      repoName: 'demo',
      stats: { nodes: 12, edges: 34, communities: 3, processes: 2 },
    }),
    callTool: async (method) => {
      if (method === 'route_map') {
        return {
          domains: [
            { name: 'auth', files: ['src/auth.ts'], entryPoints: ['src/auth.ts'] },
            { name: 'billing', files: ['src/billing.ts'] },
          ],
          crossEdges: [{ from: 'billing', to: 'auth', kind: 'imports' }],
        };
      }
      return {};
    },
  };
}

/** A code-graph service wired to the fake lib, flag ON, deterministic git. */
function enabledCodeGraph() {
  return createRecoderGitService({
    isEnabled: () => true,
    loadEngineLib: async () => fakeEngineLib(),
    git: {
      headSha: async () => 'abc1234',
      currentBranch: async () => 'main',
    },
    now: () => '2026-07-14T00:00:00.000Z',
    logger: { error: () => undefined },
  });
}

/** A no-op review engine that records the input it received. */
function fakePrReview(result?: ReviewPullRequestResult): {
  engine: PrReviewEngine;
  calls: ReviewPullRequestInput[];
} {
  const calls: ReviewPullRequestInput[] = [];
  const engine: PrReviewEngine = {
    reviewPullRequest: async (input) => {
      calls.push(input);
      return (
        result ?? { status: 'not_configured', reason: 'no auth in test' }
      );
    },
  };
  return { engine, calls };
}

/** A gh runner whose behavior per subcommand is configurable. */
function fakeRunner(handlers: Partial<Record<string, (args: string[], cwd?: string) => string>>): {
  run: GhRunner;
  calls: Array<{ args: string[]; cwd?: string }>;
} {
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const run: GhRunner = (args, cwd) => {
    calls.push({ args, cwd });
    const key = args.slice(0, 2).join(' ');
    const handler = handlers[key] ?? handlers[args[0]];
    if (!handler) throw new Error(`unexpected gh call: ${args.join(' ')}`);
    return handler(args, cwd);
  };
  return { run, calls };
}

// GITHUB_TOKEN/GH_TOKEN must not leak into the auth-probe tests.
let savedTokens: { GITHUB_TOKEN?: string; GH_TOKEN?: string };
beforeEach(() => {
  savedTokens = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});
afterEach(() => {
  if (savedTokens.GITHUB_TOKEN !== undefined) process.env.GITHUB_TOKEN = savedTokens.GITHUB_TOKEN;
  if (savedTokens.GH_TOKEN !== undefined) process.env.GH_TOKEN = savedTokens.GH_TOKEN;
  resetGitHubModule();
  vi.restoreAllMocks();
});

// ─── analyzeRepo (recodergit code-intel) ────────────────────────────────────────

describe('GitHubModule.analyzeRepo', () => {
  it('projects the in-process analyze stats into a CodeGraph', async () => {
    const mod = createGitHubModule({ codeGraph: enabledCodeGraph() });
    const graph = await mod.analyzeRepo('/work/owner-repo');
    expect(graph.status).toBe('indexed');
    expect(graph.nodes).toBe(12);
    expect(graph.edges).toBe(34);
    expect(graph.clusters).toBe(3);
    expect(graph.flows).toBe(2);
    expect(graph.headSha).toBe('abc1234');
    expect(graph.repoId).toBe('owner-repo');
  });

  it('degrades to status:disabled when the code-graph flag is off', async () => {
    const off = createRecoderGitService({ isEnabled: () => false });
    const mod = createGitHubModule({ codeGraph: off });
    const graph = await mod.analyzeRepo('/work/repo');
    expect(graph.status).toBe('disabled');
    expect(graph.nodes).toBe(0);
    expect(graph.headSha).toBeNull();
  });
});

// ─── domainMap (recodergit route_map) ────────────────────────────────────────────

describe('GitHubModule.domainMap', () => {
  it('auto-ensures an index then projects the engine route_map', async () => {
    const mod = createGitHubModule({ codeGraph: enabledCodeGraph() });
    const map = await mod.domainMap('/work/owner-repo');
    expect(map.domains.map((d) => d.name)).toEqual(['auth', 'billing']);
    expect(map.crossEdges).toEqual([{ from: 'billing', to: 'auth', kind: 'imports' }]);
  });

  it('degrades to an empty map when disabled', async () => {
    const off = createRecoderGitService({ isEnabled: () => false });
    const mod = createGitHubModule({ codeGraph: off });
    const map = await mod.domainMap('/work/repo');
    expect(map.domains).toEqual([]);
  });
});

// ─── reviewPR (pr-swarm-review) ─────────────────────────────────────────────────

describe('GitHubModule.reviewPR', () => {
  it('delegates to the pr-review engine, defaulting to swarm mode', async () => {
    const { engine, calls } = fakePrReview();
    const mod = createGitHubModule({ prReview: engine });
    await mod.reviewPR({ repo: 'o/r', prNumber: 7 });
    expect(calls[0]).toEqual({ repo: 'o/r', prNumber: 7, mode: 'swarm' });
  });

  it('passes an explicit solo mode through', async () => {
    const { engine, calls } = fakePrReview();
    const mod = createGitHubModule({ prReview: engine });
    await mod.reviewPR({ repo: 'o/r', prNumber: 7 }, 'solo');
    expect(calls[0].mode).toBe('solo');
  });

  it('surfaces the engine result unchanged (truthful not_configured)', async () => {
    const { engine } = fakePrReview({ status: 'not_configured', reason: 'no auth' });
    const mod = createGitHubModule({ prReview: engine });
    const result = await mod.reviewPR({ repo: 'o/r', prNumber: 1 });
    expect(result).toEqual({ status: 'not_configured', reason: 'no auth' });
  });
});

// ─── openPR / comment / search (gh, owned) ───────────────────────────────────────

describe('GitHubModule.openPR', () => {
  it('opens a PR via gh and returns the printed URL', async () => {
    const { run, calls } = fakeRunner({
      'pr create': () => 'https://github.com/o/r/pull/9\n',
    });
    const mod = createGitHubModule({ ghRunner: run, baseRepoRoot: '/work/r' });
    const ref = await mod.openPR({ title: 'Fix', body: 'b', repo: 'o/r', head: 'feat', base: 'main' });
    expect(ref.url).toBe('https://github.com/o/r/pull/9');
    expect(ref.title).toBe('Fix');
    // Ran in the workspace repo root.
    expect(calls[0].cwd).toBe('/work/r');
    expect(calls[0].args).toContain('--head');
  });

  it('maps a gh auth failure to a truthful error (no fabricated PR)', async () => {
    const { run } = fakeRunner({
      'pr create': () => {
        throw new Error('gh: HTTP 401 authentication required');
      },
    });
    const mod = createGitHubModule({ ghRunner: run });
    await expect(mod.openPR({ title: 'x' })).rejects.toThrow(/authenticated/i);
  });
});

describe('GitHubModule.comment', () => {
  it('resolves the PR number from a /pull/N url and comments via gh', async () => {
    const { run, calls } = fakeRunner({
      'pr comment': () => 'https://github.com/o/r/pull/3#issuecomment-1\n',
    });
    const mod = createGitHubModule({ ghRunner: run });
    await mod.comment({ url: 'https://github.com/o/r/pull/3', repo: 'o/r' }, 'LGTM');
    expect(calls[0].args).toEqual(['pr', 'comment', '3', '--body', 'LGTM', '--repo', 'o/r']);
  });

  it('throws truthfully when no PR number can be resolved', async () => {
    const { run } = fakeRunner({});
    const mod = createGitHubModule({ ghRunner: run });
    await expect(mod.comment({ url: 'not-a-pr-url' }, 'hi')).rejects.toThrow(/pr number is required/i);
  });
});

describe('GitHubModule.search', () => {
  it('searches GitHub repos and maps rows into Matches', async () => {
    const { run } = fakeRunner({
      'search repos': () =>
        JSON.stringify([
          { fullName: 'o/r', description: 'demo', url: 'https://github.com/o/r', stargazersCount: 42 },
        ]),
    });
    const mod = createGitHubModule({ ghRunner: run });
    const matches = await mod.search('demo', { scope: 'github' });
    expect(matches).toEqual([
      { ref: 'o/r', description: 'demo', url: 'https://github.com/o/r', stars: 42 },
    ]);
  });

  it('searches the local tree via the injected gitGrep seam', async () => {
    const mod = createGitHubModule({
      gitGrep: (query, cwd, limit) => {
        expect(query).toBe('needle');
        expect(limit).toBe(50);
        return [{ ref: 'src/a.ts', snippet: 'const needle = 1' }];
      },
    });
    const matches = await mod.search('needle', { scope: 'repo', repoPath: '/work/r' });
    expect(matches[0].ref).toBe('src/a.ts');
  });
});

// ─── health (truthful, degrade-safe) ─────────────────────────────────────────────

describe('GitHubModule.health', () => {
  it('reports recodergitLib up + gh authed when the probe succeeds', async () => {
    const { run } = fakeRunner({ 'auth status': () => '' });
    const mod = createGitHubModule({ codeGraph: enabledCodeGraph(), ghRunner: run });
    expect(await mod.health()).toEqual({
      recodergitLib: 'up',
      gh: 'authed',
      codeGraphEnabled: true,
    });
  });

  it('reports gh not_authed when the auth probe fails', async () => {
    const { run } = fakeRunner({
      'auth status': () => {
        throw new Error('You are not logged into any GitHub hosts');
      },
    });
    const mod = createGitHubModule({ codeGraph: enabledCodeGraph(), ghRunner: run });
    expect((await mod.health()).gh).toBe('not_authed');
  });

  it('reports gh absent when the gh binary is missing', async () => {
    const { run } = fakeRunner({
      'auth status': () => {
        throw new Error('spawn gh ENOENT');
      },
    });
    const mod = createGitHubModule({ ghRunner: run });
    expect((await mod.health()).gh).toBe('absent');
  });

  it('reports recodergitLib disabled + codeGraphEnabled false when the flag is off', async () => {
    const off = createRecoderGitService({ isEnabled: () => false });
    const { run } = fakeRunner({ 'auth status': () => '' });
    const mod = createGitHubModule({ codeGraph: off, ghRunner: run });
    const h = await mod.health();
    expect(h.recodergitLib).toBe('disabled');
    expect(h.codeGraphEnabled).toBe(false);
  });
});

// ─── singleton accessor ──────────────────────────────────────────────────────────

describe('getGitHubModule singleton', () => {
  it('returns the same instance across calls and honors setGitHubModule', () => {
    const first = getGitHubModule();
    expect(getGitHubModule()).toBe(first);
    const injected = createGitHubModule({}) as GitHubModule;
    setGitHubModule(injected);
    expect(getGitHubModule()).toBe(injected);
    resetGitHubModule();
    expect(getGitHubModule()).not.toBe(injected);
  });
});
