/**
 * Tests for the GitHub PR-review engine (pr-swarm-review wiring).
 * All IO seams (auth check, pack loader, executor) are injected — NO network,
 * NO real `gh`, NO LLM. The only real-FS test reads the vendored prompt pack
 * (read-only) to pin the pack shape the default loader depends on.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  BRANCH_HYGIENE_CLASSIFICATIONS,
  FINAL_VERDICTS,
  MERGE_STATES,
  compileReviewBundle,
  createPrReviewEngine,
  defaultCheckGitHubAuth,
  defaultLoadReviewPack,
  defaultPackDir,
  parameterizeForRepo,
  parseReviewClassifications,
  reviewPullRequest,
  type GitHubAuthStatus,
  type ReviewPack,
} from './pr-review';

const PACK: ReviewPack = {
  orchestration:
    'You are the review coordinator for the RecoderGit repository\n' +
    '(`https://github.com/abhigyanpatwari/RecoderGit`). Run all seven lanes.\n' +
    'Final verdict options: production-ready | not production-ready.',
  personas: [
    {
      name: '01-pr-facts-historian.md',
      content: 'gh pr list --search "<term> repo:abhigyanpatwari/RecoderGit"',
    },
    { name: '07-synthesis-critic.md', content: 'Critique the draft review.' },
  ],
};

const authOk = async (): Promise<GitHubAuthStatus> => ({ configured: true, via: 'env' });
const authAbsent = async (): Promise<GitHubAuthStatus> => ({
  configured: false,
  reason: 'no GitHub token and gh CLI not authenticated',
});
const silentLogger = { error: () => undefined };

const INPUT = { repo: 'octocat/hello-world', prNumber: 42 } as const;

describe('reviewPullRequest — input validation (before any IO)', () => {
  it('rejects a missing/badly-shaped repo and bad prNumber without calling any seam', async () => {
    const checkAuth = vi.fn(authOk);
    const loadPack = vi.fn(async () => PACK);
    const engine = createPrReviewEngine({ checkAuth, loadPack });

    for (const bad of [
      {},
      { repo: 'not-a-full-name', prNumber: 1 },
      { repo: 'a/b/c', prNumber: 1 },
      { repo: 'octocat/hello-world' },
      { repo: 'octocat/hello-world', prNumber: 0 },
      { repo: 'octocat/hello-world', prNumber: 1.5 },
      { prUrl: 'https://example.com/owner/repo/pull/1' },
      { prUrl: 'https://github.com/owner/repo/issues/1' },
    ]) {
      const result = await engine.reviewPullRequest(bad as never);
      expect(result.status).toBe('invalid_input');
    }
    expect(checkAuth).not.toHaveBeenCalled();
    expect(loadPack).not.toHaveBeenCalled();
  });

  it('rejects a repo that contradicts the prUrl', async () => {
    const result = await reviewPullRequest(
      { repo: 'someone/else', prUrl: 'https://github.com/octocat/hello-world/pull/42' },
      { checkAuth: authOk, loadPack: async () => PACK },
    );
    expect(result.status).toBe('invalid_input');
  });

  it('derives the repo from prUrl (case-insensitive repo match allowed)', async () => {
    const result = await reviewPullRequest(
      { repo: 'OctoCat/Hello-World', prUrl: 'https://github.com/octocat/hello-world/pull/42' },
      { checkAuth: authOk, loadPack: async () => PACK },
    );
    // No executor configured -> unavailable, but the bundle is compiled for the URL repo.
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.bundle?.repo).toBe('octocat/hello-world');
    expect(result.bundle?.target).toBe('https://github.com/octocat/hello-world/pull/42');
  });
});

describe('reviewPullRequest — truthful auth gate', () => {
  it("returns 'not_configured' when GitHub auth is absent and never touches the pack", async () => {
    const loadPack = vi.fn(async () => PACK);
    const result = await reviewPullRequest(INPUT, { checkAuth: authAbsent, loadPack });
    expect(result).toEqual({
      status: 'not_configured',
      reason: 'no GitHub token and gh CLI not authenticated',
    });
    expect(loadPack).not.toHaveBeenCalled();
  });

  it("auth check throwing -> 'not_configured' (never throws)", async () => {
    const result = await reviewPullRequest(INPUT, {
      checkAuth: async () => {
        throw new Error('gh exploded');
      },
      loadPack: async () => PACK,
      logger: silentLogger,
    });
    expect(result.status).toBe('not_configured');
  });

  it('defaultCheckGitHubAuth: GITHUB_TOKEN env wins without spawning gh', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-placeholder-token');
    try {
      await expect(defaultCheckGitHubAuth()).resolves.toEqual({ configured: true, via: 'env' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('reviewPullRequest — pack loading and compilation', () => {
  it("missing pack -> truthful 'unavailable' naming the expected path", async () => {
    const result = await reviewPullRequest(INPUT, {
      checkAuth: authOk,
      loadPack: async () => null,
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.reason).toContain(defaultPackDir());
    expect(result.bundle).toBeUndefined();
  });

  it("pack loader throwing -> 'unavailable' (never throws)", async () => {
    const result = await reviewPullRequest(INPUT, {
      checkAuth: authOk,
      loadPack: async () => {
        throw new Error('fs boom');
      },
      logger: silentLogger,
    });
    expect(result.status).toBe('unavailable');
  });

  it('no executor -> unavailable WITH the compiled, repo-parameterized bundle', async () => {
    const result = await reviewPullRequest(INPUT, { checkAuth: authOk, loadPack: async () => PACK });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    const bundle = result.bundle;
    expect(bundle).toBeDefined();
    expect(bundle?.repo).toBe('octocat/hello-world');
    expect(bundle?.target).toBe('https://github.com/octocat/hello-world/pull/42');
    expect(bundle?.mode).toBe('solo');
    // Genericization: the upstream hardcoded repo must be fully rewritten.
    expect(bundle?.instructions).not.toContain('abhigyanpatwari/RecoderGit');
    expect(bundle?.orchestration).toContain('https://github.com/octocat/hello-world');
    expect(bundle?.personas[0]?.content).toContain('repo:octocat/hello-world');
    // The compiled document carries the target and the read-only contract.
    expect(bundle?.instructions).toContain('Target pull request: https://github.com/octocat/hello-world/pull/42');
    expect(bundle?.instructions).toContain('Read-only contract');
    expect(bundle?.instructions).toContain('Persona: 07-synthesis-critic.md');
  });

  it('mode passes through (swarm)', async () => {
    const result = await reviewPullRequest(
      { ...INPUT, mode: 'swarm' },
      { checkAuth: authOk, loadPack: async () => PACK },
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.bundle?.mode).toBe('swarm');
    expect(result.bundle?.instructions).toContain('Execution mode: swarm');
  });

  it('parameterizeForRepo rewrites URL first, then bare full name (URLs never mangled)', () => {
    const rewritten = parameterizeForRepo(
      'See https://github.com/abhigyanpatwari/RecoderGit and repo:abhigyanpatwari/RecoderGit ' +
        'in the RecoderGit repository.',
      'octo/dog',
    );
    expect(rewritten).toBe('See https://github.com/octo/dog and repo:octo/dog in the target repository.');
  });

  it('compileReviewBundle keeps persona ordering', () => {
    const bundle = compileReviewBundle(PACK, {
      repo: 'octo/dog',
      target: 'https://github.com/octo/dog/pull/1',
      mode: 'solo',
    });
    expect(bundle.personas.map((p) => p.name)).toEqual([
      '01-pr-facts-historian.md',
      '07-synthesis-critic.md',
    ]);
  });
});

describe('reviewPullRequest — execution', () => {
  const REVIEW_TEXT = [
    '## Merge status and mergeability',
    'Classification: blocked by conflicts (evidence: gh pr view shows CONFLICTING).',
    '## Branch hygiene assessment',
    'Classification: clean feature/fix PR.',
    '## Final verdict',
    'not production-ready — the migration lacks a rollback path (3 more sentences...).',
  ].join('\n');

  it('executor result -> completed with typed classifications', async () => {
    const executor = vi.fn(async () => REVIEW_TEXT);
    const result = await reviewPullRequest(INPUT, {
      checkAuth: authOk,
      loadPack: async () => PACK,
      executor,
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('expected completed');
    expect(result.raw).toBe(REVIEW_TEXT);
    expect(result.classifications).toEqual({
      verdict: 'not production-ready',
      mergeState: 'blocked by conflicts',
      branchHygiene: 'clean feature/fix PR',
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0][0].repo).toBe('octocat/hello-world');
  });

  it("executor throwing -> 'unavailable' with the bundle (never throws)", async () => {
    const result = await reviewPullRequest(INPUT, {
      checkAuth: authOk,
      loadPack: async () => PACK,
      executor: async () => {
        throw new Error('run failed');
      },
      logger: silentLogger,
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.reason).toContain('review execution failed');
    expect(result.bundle?.repo).toBe('octocat/hello-world');
  });
});

describe('parseReviewClassifications', () => {
  it('distinguishes the overlapping verdict literals', () => {
    expect(
      parseReviewClassifications('Final verdict: production-ready with minor follow-ups.').verdict,
    ).toBe('production-ready with minor follow-ups');
    expect(parseReviewClassifications('Final verdict: not production-ready.').verdict).toBe(
      'not production-ready',
    );
    expect(parseReviewClassifications('Final verdict: production-ready.').verdict).toBe('production-ready');
    expect(
      parseReviewClassifications('Final verdict: rebase/split required before final review.').verdict,
    ).toBe('rebase/split required before final review');
  });

  it('anchors the verdict to the LAST "Final verdict" section', () => {
    const text =
      'Allowed verdicts: production-ready | not production-ready\n' +
      '...long review...\n' +
      '## Final verdict\nproduction-ready with minor follow-ups';
    expect(parseReviewClassifications(text).verdict).toBe('production-ready with minor follow-ups');
  });

  it('returns nulls (never guesses) when nothing matches', () => {
    expect(parseReviewClassifications('nothing typed here')).toEqual({
      verdict: null,
      mergeState: null,
      branchHygiene: null,
    });
  });

  it('classification tables stay in sync with the orchestration contract', () => {
    expect(FINAL_VERDICTS).toHaveLength(4);
    expect(MERGE_STATES).toHaveLength(9);
    expect(BRANCH_HYGIENE_CLASSIFICATIONS).toHaveLength(4);
  });
});

describe('defaultLoadReviewPack — vendored pack on real FS (read-only)', () => {
  it('loads orchestration.md + the 7 persona lanes with the upstream repo hardcoded', async () => {
    const pack = await defaultLoadReviewPack();
    expect(pack).not.toBeNull();
    if (!pack) throw new Error('expected the vendored pack');
    expect(pack.orchestration).toContain('abhigyanpatwari/RecoderGit');
    expect(pack.personas).toHaveLength(7);
    expect(pack.personas[0]?.name).toBe('01-pr-facts-historian.md');
    expect(pack.personas[6]?.name).toBe('07-synthesis-critic.md');
  });
});
