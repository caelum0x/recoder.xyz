/**
 * GithubPrReviewAdapter tests — the bounded, degrade-truthful projection of the
 * engines GithubModule `reviewPR` result into the readiness `review` facet:
 *
 *  - an ok InvokeResult projects PR number + truncation flag + a CAPPED
 *    top-symbols blast radius (the raw diff NEVER rides the projection);
 *  - a failed InvokeResult (gh missing/unauthenticated) ⇒ `available:false`
 *    with the truthful reason — never a fabricated review;
 *  - a THROWING facet degrades to `available:false` (never throws upward);
 *  - an oversized impact symbol list is truncated to the cap, highest-reference
 *    symbols first.
 */
import { describe, it, expect } from 'vitest';
import {
  countReferences,
  createGithubPrReviewAdapter,
  MAX_TOP_SYMBOLS,
  type GithubReviewFacet,
  type GithubReviewValue,
} from './github-review.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

function reviewValue(overrides: Partial<GithubReviewValue> = {}): GithubReviewValue {
  return {
    pr: { number: 7, title: 'feat: x' },
    diff: 'diff --git a/x b/x',
    diffTruncated: false,
    impact: { available: true, changedSymbols: ['a'], symbols: [{ symbol: 'a', references: [1], callGraph: null }] },
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
    expect(view.impact).toEqual({
      available: true,
      symbolCount: 1,
      topSymbols: [{ symbol: 'a', references: 1 }],
    });
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

  it('an OVERSIZED impact symbol list is truncated to the cap, highest references first', async () => {
    const symbols = Array.from({ length: MAX_TOP_SYMBOLS + 7 }, (_, i) => ({
      symbol: `sym_${i}`,
      references: Array.from({ length: i }, () => 'ref'),
      callGraph: null,
    }));
    const adapter = adapterOver({
      reviewPR: async () => ({
        ok: true,
        value: reviewValue({
          impact: { available: true, changedSymbols: symbols.map((s) => s.symbol), symbols },
        }),
      }),
    });
    const view = await adapter.review(INPUT);
    expect(view.impact?.symbolCount).toBe(MAX_TOP_SYMBOLS + 7);
    expect(view.impact?.topSymbols).toHaveLength(MAX_TOP_SYMBOLS);
    // Highest-reference symbol leads; every kept entry outranks the dropped ones.
    expect(view.impact?.topSymbols[0]).toEqual({
      symbol: `sym_${MAX_TOP_SYMBOLS + 6}`,
      references: MAX_TOP_SYMBOLS + 6,
    });
    const kept = view.impact?.topSymbols.map((s) => s.references) ?? [];
    expect(Math.min(...kept)).toBeGreaterThanOrEqual(7);
  });

  it('an unavailable impact projects its truthful reason (never fabricated)', async () => {
    const adapter = adapterOver({
      reviewPR: async () => ({
        ok: true,
        value: reviewValue({
          impact: {
            available: false,
            reason: 'recodergit code-graph disabled',
            changedSymbols: [],
            symbols: [],
          },
        }),
      }),
    });
    const view = await adapter.review(INPUT);
    expect(view.impact).toEqual({
      available: false,
      reason: 'recodergit code-graph disabled',
      symbolCount: 0,
      topSymbols: [],
    });
  });
});

describe('countReferences (unknown-shaped engine readings, truthful floor 0)', () => {
  it('counts arrays, nested arrays, and numeric counts; everything else is 0', () => {
    expect(countReferences([1, 2, 3])).toBe(3);
    expect(countReferences({ references: ['a', 'b'] })).toBe(2);
    expect(countReferences({ results: [1] })).toBe(1);
    expect(countReferences({ items: [] })).toBe(0);
    expect(countReferences({ count: 5 })).toBe(5);
    expect(countReferences({ total: 9 })).toBe(9);
    expect(countReferences({ count: -1 })).toBe(0);
    expect(countReferences(null)).toBe(0);
    expect(countReferences(undefined)).toBe(0);
    expect(countReferences('nonsense')).toBe(0);
  });
});
