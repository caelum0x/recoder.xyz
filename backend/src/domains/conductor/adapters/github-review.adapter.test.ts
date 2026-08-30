/**
 * GithubPrReviewAdapter tests — the bounded, degrade-truthful projection of the
 * engines GithubModule `reviewPR` result into the readiness `review` facet:
 *
 *  - an ok InvokeResult projects PR number + truncation flag + the shared
 *    bounded impact ledger (the raw diff NEVER rides the projection);
 *  - a failed InvokeResult (gh missing/unauthenticated) ⇒ `available:false`
 *    with the truthful reason — never a fabricated review;
 *  - a THROWING facet degrades to `available:false` (never throws upward);
 *  - file/test/direction/depth/risk evidence survives unchanged.
 */
import { describe, it, expect } from 'vitest';
import {
  createGithubPrReviewAdapter,
  type GithubReviewFacet,
  type GithubReviewValue,
} from './github-review.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

function impactLedger(overrides: Partial<GithubReviewValue['impact']> = {}): GithubReviewValue['impact'] {
  const files = [{
    path: 'src/caller.ts',
    isTest: false,
    minDepth: 1,
    directions: ['upstream'] as const,
    changedSymbols: ['a'],
    symbols: ['caller.ts'],
    relationTypes: ['IMPORTED_BY'],
    processes: [],
  }];
  return {
    available: true,
    source: 'recodergit',
    scope: 'file',
    risk: 'LOW',
    partial: false,
    files,
    tests: [],
    processes: [],
    summary: {
      impactedFiles: 1,
      affectedTests: 0,
      upstreamFiles: 1,
      downstreamFiles: 0,
      affectedProcesses: 0,
    },
    ...overrides,
  };
}

function reviewValue(overrides: Partial<GithubReviewValue> = {}): GithubReviewValue {
  return {
    pr: { number: 7, title: 'feat: x' },
    diff: 'diff --git a/x b/x',
    diffTruncated: false,
    impact: impactLedger(),
    ...overrides,
  };
}

function adapterOver(facet: GithubReviewFacet) {
  return createGithubPrReviewAdapter({ github: () => facet, logger: makeLogger() });
}

const INPUT = { prNumber: 7, repoRoot: '/tmp/repo', workspaceId: 'ws_1' };

describe('createGithubPrReviewAdapter', () => {
  it('projects an ok result into bounded review evidence (no raw diff)', async () => {
    let seen: { pr: string; repoRoot: string } | undefined;
    const adapter = adapterOver({
      reviewPR: async (input) => {
        seen = input;
        return { ok: true, value: reviewValue({ diffTruncated: true }) };
      },
    });
    const view = await adapter.review(INPUT);
    expect(seen).toEqual({ pr: '7', repoRoot: '/tmp/repo' });
    expect(view.available).toBe(true);
    expect(view.pr).toBe(7);
    expect(view.diffTruncated).toBe(true);
    expect(view.impact).toEqual(impactLedger());
    // The raw diff must NOT ride the readiness payload.
    expect(JSON.stringify(view)).not.toContain('diff --git');
  });

  it('a failed InvokeResult (gh missing) ⇒ available:false with the truthful reason', async () => {
    const adapter = adapterOver({
      reviewPR: async () => ({ ok: false, reason: 'gh CLI not found on PATH' }),
    });
    const view = await adapter.review(INPUT);
    expect(view).toEqual({ available: false, reason: 'gh CLI not found on PATH', pr: 7 });
  });

  it('a THROWING facet degrades to available:false (never throws upward)', async () => {
    const adapter = adapterOver({
      reviewPR: async () => {
        throw new Error('sidecar exploded');
      },
    });
    const view = await adapter.review(INPUT);
    expect(view.available).toBe(false);
    expect(view.reason).toContain('sidecar exploded');
    expect(view.pr).toBe(7);
  });

  it('an unavailable diff carries the truthful reason while the review stays available', async () => {
    const adapter = adapterOver({
      reviewPR: async () => ({
        ok: true,
        value: reviewValue({ diff: null, diffUnavailable: 'gh pr diff failed' }),
      }),
    });
    const view = await adapter.review(INPUT);
    expect(view.available).toBe(true);
    expect(view.reason).toBe('gh pr diff failed');
  });

  it('passes the shared file/test/direction/depth/risk ledger without a second interpretation', async () => {
    const testFile = {
      path: 'src/caller.test.ts',
      isTest: true,
      minDepth: 2,
      directions: ['upstream', 'downstream'] as const,
      changedSymbols: ['a'],
      symbols: ['caller.test.ts'],
      relationTypes: ['IMPORTED_BY', 'IMPORTS'],
      processes: ['checkout'],
    };
    const impact = impactLedger({
      scope: 'mixed',
      risk: 'HIGH',
      partial: true,
      files: [impactLedger().files[0]!, testFile],
      tests: [testFile],
      processes: [{ id: 'checkout', label: 'Checkout', processType: 'request' }],
      summary: {
        impactedFiles: 2,
        affectedTests: 1,
        upstreamFiles: 2,
        downstreamFiles: 1,
        affectedProcesses: 1,
      },
    });
    const adapter = adapterOver({
      reviewPR: async () => ({
        ok: true,
        value: reviewValue({ impact }),
      }),
    });
    const view = await adapter.review(INPUT);
    expect(view.impact).toEqual(impact);
  });

  it('an unavailable impact projects its truthful reason (never fabricated)', async () => {
    const adapter = adapterOver({
      reviewPR: async () => ({
        ok: true,
        value: reviewValue({
          impact: impactLedger({
            available: false,
            reason: 'recodergit code-graph disabled',
            scope: 'unavailable',
            risk: 'UNKNOWN',
            files: [],
            tests: [],
            processes: [],
            summary: {
              impactedFiles: 0,
              affectedTests: 0,
              upstreamFiles: 0,
              downstreamFiles: 0,
              affectedProcesses: 0,
            },
          }),
        }),
      }),
    });
    const view = await adapter.review(INPUT);
    expect(view.impact).toEqual({
      available: false,
      reason: 'recodergit code-graph disabled',
      source: 'recodergit',
      scope: 'unavailable',
      risk: 'UNKNOWN',
      partial: false,
      files: [],
      tests: [],
      processes: [],
      summary: {
        impactedFiles: 0,
        affectedTests: 0,
        upstreamFiles: 0,
        downstreamFiles: 0,
        affectedProcesses: 0,
      },
    });
  });
});
