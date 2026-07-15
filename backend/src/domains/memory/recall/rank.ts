/**
 * recall/rank — lexical scoring + ColBERT rerank for fused recall.
 *
 * Two concerns, both pure/degrade-safe:
 *  - `lexicalScore` gives an offline relevance signal in `[0, 1]` for memories
 *    that arrive without a source score (a beads wisp, a durable store item):
 *    token overlap between the query and the memory body. It is a truthful,
 *    explainable fallback — never a fabricated confidence.
 *  - `rerankMemories` runs the pooled candidates through the ColBERT reranker
 *    (`rerankPassages`); when the sidecar is up it reorders by late-interaction
 *    relevance, and when it is down it returns the input order unchanged (the
 *    `reranker: 'identity'` case). It never throws.
 *
 * Ordering contract: rerank decides the ORDER; a memory's `provenance.score`
 * keeps the SOURCE's own score (truthful attribution), so the two never lie about
 * each other.
 */
import { tokenSet } from './dedupe.js';
import type { RecalledMemory } from '../types.js';

/** The narrow rerank capability recall depends on (the colbert adapter's method). */
export interface PassageReranker {
  rerankPassages(
    query: string,
    passages: readonly string[],
  ): Promise<{ readonly available: boolean; readonly order: readonly number[] }>;
}

/**
 * Lexical relevance of `body` to `query`: fraction of distinct query tokens that
 * appear in the body, in `[0, 1]`. Empty query or body → 0 (no fabricated score).
 */
export function lexicalScore(query: string, body: string): number {
  const q = tokenSet(query);
  if (q.size === 0) return 0;
  const b = tokenSet(body);
  if (b.size === 0) return 0;
  let hits = 0;
  for (const token of q) if (b.has(token)) hits += 1;
  return hits / q.size;
}

/** Stable sort by descending score (ties keep original order). Returns a copy. */
export function sortByScore(memories: readonly RecalledMemory[]): RecalledMemory[] {
  return memories
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => {
      const diff = b.memory.provenance.score - a.memory.provenance.score;
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.memory);
}

/** The outcome of a rerank pass: the reordered list + which reranker actually ran. */
export interface RerankOutcome {
  readonly ordered: readonly RecalledMemory[];
  readonly reranker: 'colbert' | 'identity';
}

/**
 * Reorder `memories` by ColBERT late-interaction relevance to `query`. Falls back
 * to a score-descending order when the reranker is unavailable or returns an
 * unusable permutation. Never throws (any reranker fault degrades to identity).
 */
export async function rerankMemories(
  query: string,
  memories: readonly RecalledMemory[],
  reranker: PassageReranker,
): Promise<RerankOutcome> {
  if (memories.length <= 1) {
    return { ordered: [...memories], reranker: 'identity' };
  }

  const scoreOrdered = sortByScore(memories);

  let result: { available: boolean; order: readonly number[] };
  try {
    result = await reranker.rerankPassages(query, scoreOrdered.map((m) => m.body));
  } catch {
    return { ordered: scoreOrdered, reranker: 'identity' };
  }

  if (!result.available) {
    return { ordered: scoreOrdered, reranker: 'identity' };
  }

  // Apply the permutation defensively: only accept in-range, unique indices.
  const seen = new Set<number>();
  const reordered: RecalledMemory[] = [];
  for (const index of result.order) {
    if (index < 0 || index >= scoreOrdered.length || seen.has(index)) continue;
    seen.add(index);
    reordered.push(scoreOrdered[index]);
  }
  // Backfill any indices the reranker omitted (keep every candidate, once).
  for (let i = 0; i < scoreOrdered.length; i += 1) {
    if (!seen.has(i)) reordered.push(scoreOrdered[i]);
  }

  return { ordered: reordered, reranker: 'colbert' };
}
