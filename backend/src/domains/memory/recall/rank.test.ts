/**
 * recall/rank tests — the recall-fusion ranking primitives. Locks the truth
 * invariants of the ORDER decision:
 *
 *  - `lexicalScore` is a truthful, explainable `[0, 1]` fallback: the fraction of
 *    DISTINCT query tokens present in the body; an empty query/body → 0 (never a
 *    fabricated confidence).
 *  - `sortByScore` is a STABLE descending sort on `provenance.score` that returns a
 *    copy (input is never mutated).
 *  - `rerankMemories` lets ColBERT decide the ORDER when up, and DEGRADES to a
 *    score-descending identity order when the reranker is unavailable, throws, or
 *    returns an unusable permutation — every candidate survives exactly once, and
 *    each memory's `provenance.score` (source attribution) is left untouched.
 */
import { describe, it, expect } from 'vitest';
import type { RecalledMemory } from '../types.js';
import {
  lexicalScore,
  sortByScore,
  rerankMemories,
  type PassageReranker,
} from './rank.js';

function mem(id: string, body: string, score: number): RecalledMemory {
  return {
    id,
    body,
    provenance: { source: 'beads', ref: id, score },
  };
}

/** A reranker that returns a fixed permutation + availability (never throws). */
function fixedReranker(available: boolean, order: readonly number[]): PassageReranker {
  return {
    async rerankPassages() {
      return { available, order };
    },
  };
}

describe('lexicalScore — truthful [0,1] token overlap', () => {
  it('returns 1 when every distinct query token appears in the body', () => {
    expect(lexicalScore('box gpu', 'the box has no gpu at all')).toBe(1);
  });

  it('returns the fraction of distinct query tokens present in the body', () => {
    // query tokens: {the, box, memory} (3) — body contains {the, box} → 2/3.
    expect(lexicalScore('the box memory', 'the box is 16gb')).toBeCloseTo(2 / 3, 10);
  });

  it('counts each query token once (distinct), ignoring duplicates + punctuation + case', () => {
    // "Box, box!" collapses to the single distinct token {box}; body has it → 1.
    expect(lexicalScore('Box, box!', 'the BOX is here')).toBe(1);
  });

  it('returns 0 for an empty (or all-punctuation) query — no fabricated score', () => {
    expect(lexicalScore('', 'anything here')).toBe(0);
    expect(lexicalScore('   !!! ', 'anything here')).toBe(0);
  });

  it('returns 0 for an empty body', () => {
    expect(lexicalScore('box gpu', '')).toBe(0);
  });

  it('returns 0 when no query token overlaps the body', () => {
    expect(lexicalScore('kubernetes helm', 'the box is 16gb')).toBe(0);
  });
});

describe('sortByScore — stable descending, non-mutating', () => {
  it('orders by descending provenance.score', () => {
    const input = [mem('a', 'x', 0.2), mem('b', 'y', 0.9), mem('c', 'z', 0.5)];
    expect(sortByScore(input).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps original order for ties (stable)', () => {
    const input = [mem('a', 'x', 0.5), mem('b', 'y', 0.5), mem('c', 'z', 0.5)];
    expect(sortByScore(input).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns a NEW array and does not mutate the input', () => {
    const input = [mem('a', 'x', 0.2), mem('b', 'y', 0.9)];
    const out = sortByScore(input);
    expect(out).not.toBe(input);
    // Input order is preserved (proof of no in-place sort).
    expect(input.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('rerankMemories — ColBERT decides order, degrades to identity', () => {
  const three = [mem('a', 'alpha', 0.3), mem('b', 'bravo', 0.9), mem('c', 'charlie', 0.6)];

  it('short-circuits to identity for 0 or 1 memories (nothing to reorder)', async () => {
    const one = [mem('a', 'alpha', 0.3)];
    const out = await rerankMemories('q', one, fixedReranker(true, [0]));
    expect(out.reranker).toBe('identity');
    expect(out.ordered.map((m) => m.id)).toEqual(['a']);
    // A copy, not the same array reference.
    expect(out.ordered).not.toBe(one);
  });

  it('applies the ColBERT permutation over the SCORE-ORDERED list when available', async () => {
    // scoreOrdered = [b(0.9), c(0.6), a(0.3)]. Permutation [2,0,1] → [a, b, c].
    const out = await rerankMemories('q', three, fixedReranker(true, [2, 0, 1]));
    expect(out.reranker).toBe('colbert');
    expect(out.ordered.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves each memory provenance.score (order changes, attribution does not)', async () => {
    const out = await rerankMemories('q', three, fixedReranker(true, [2, 0, 1]));
    const byId = Object.fromEntries(out.ordered.map((m) => [m.id, m.provenance.score]));
    expect(byId).toEqual({ a: 0.3, b: 0.9, c: 0.6 });
  });

  it('degrades to score-descending identity when the reranker is unavailable', async () => {
    const out = await rerankMemories('q', three, fixedReranker(false, [2, 0, 1]));
    expect(out.reranker).toBe('identity');
    expect(out.ordered.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('degrades to score-descending identity when the reranker THROWS (never throws out)', async () => {
    const throwing: PassageReranker = {
      async rerankPassages() {
        throw new Error('sidecar down');
      },
    };
    const out = await rerankMemories('q', three, throwing);
    expect(out.reranker).toBe('identity');
    expect(out.ordered.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('defensively ignores out-of-range + duplicate indices and backfills omissions (every candidate once)', async () => {
    // scoreOrdered = [b, c, a]. Dirty permutation: dup(0), out-of-range(9,-1), omit index 2.
    const out = await rerankMemories('q', three, fixedReranker(true, [0, 0, 9, -1]));
    expect(out.reranker).toBe('colbert');
    // index 0 (b) accepted once; the omitted indices (c, a) backfilled in score order.
    expect(out.ordered.map((m) => m.id)).toEqual(['b', 'c', 'a']);
    // No candidate is dropped or duplicated.
    expect(out.ordered).toHaveLength(3);
    expect(new Set(out.ordered.map((m) => m.id)).size).toBe(3);
  });
});
