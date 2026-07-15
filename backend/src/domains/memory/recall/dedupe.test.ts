/**
 * recall/dedupe tests — the near-duplicate collapse that keeps each fact once.
 */
import { describe, it, expect } from 'vitest';
import { dedupeMemories, jaccard, tokenSet } from './dedupe.js';
import type { RecalledMemory } from '../types.js';

function mem(id: string, body: string, score = 0.5): RecalledMemory {
  return { id, body, provenance: { source: 'items', ref: id, score } };
}

describe('tokenSet', () => {
  it('lowercases, strips punctuation, and dedupes tokens', () => {
    const set = tokenSet('The Cat, the CAT! sat.');
    expect([...set].sort()).toEqual(['cat', 'sat', 'the']);
  });
});

describe('jaccard', () => {
  it('is 1 for identical token sets and 0 for disjoint', () => {
    expect(jaccard(tokenSet('alpha beta'), tokenSet('beta alpha'))).toBe(1);
    expect(jaccard(tokenSet('alpha'), tokenSet('omega'))).toBe(0);
  });

  it('is 0 when either set is empty', () => {
    expect(jaccard(tokenSet(''), tokenSet('alpha'))).toBe(0);
  });
});

describe('dedupeMemories', () => {
  it('collapses exact-duplicate bodies, keeping the first (best-ranked)', () => {
    const out = dedupeMemories(
      [mem('a', 'deploy uses pm2 and nginx', 0.9), mem('b', 'deploy uses pm2 and nginx', 0.4)],
      0.9,
    );
    expect(out.map((m) => m.id)).toEqual(['a']);
  });

  it('keeps distinct facts', () => {
    const out = dedupeMemories([mem('a', 'auth is better auth'), mem('b', 'db is postgres 17')], 0.9);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('collapses near-duplicates above the threshold but preserves order', () => {
    const out = dedupeMemories(
      [
        mem('a', 'the production database is postgres 17 on hetzner'),
        mem('b', 'production database is postgres 17 on hetzner box'),
        mem('c', 'the frontend is remix on vite'),
      ],
      0.6,
    );
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [mem('a', 'x'), mem('a', 'x')];
    const copy = [...input];
    dedupeMemories(input, 0.9);
    expect(input).toEqual(copy);
  });
});
