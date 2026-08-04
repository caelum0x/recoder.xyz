/**
 * recall/rank — lexical scoring + ColBERT rerank for fused recall.
 *
 * Three concerns, all pure/degrade-safe:
 *  - `lexicalScore` gives an offline relevance signal in `[0, 1]` for memories
 *    that arrive without a source score (a beads wisp, a durable store item):
 *    token overlap between the query and the memory body. It is a truthful,
 *    explainable fallback — never a fabricated confidence.
 *  - `lexicalRerank` is the BM25-ish pure-TS fallback ranker: IDF-weighted
 *    distinct-token match with document-length normalization over the pooled
 *    bodies. Deterministic (stable sort, index tiebreak), zero deps, no I/O.
 *  - `rerankMemories` runs the pooled candidates through the ColBERT reranker
 *    (`rerankPassages`); when the sidecar is up it reorders by late-interaction
 *    relevance. When it is down/faulted it DEGRADES TRUTHFULLY: the lexical
 *    fallback ranks (reported as `reranker: 'lexical'` + a `reason`), and only
 *    when even that has zero signal does the source-score order stand
 *    (`reranker: 'identity'` + a `reason`). It never throws, and it never
 *    reports a rerank that did not run.
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

/** BM25 constants (standard defaults; tf saturates at 1 because bodies are token SETS). */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * BM25-ish rerank of `memories` by relevance to `query`: per distinct query
 * token, an IDF weight over the pooled bodies (rare tokens count more), damped
 * by document-length normalization. Pure + deterministic: stable descending
 * sort, ties keep input order, input never mutated. Returns the reordered copy
 * and whether ANY memory scored above zero (no signal ⇒ ranking is meaningless
 * and the caller must not claim a lexical rerank ran).
 */
export function lexicalRerank(
  query: string,
  memories: readonly RecalledMemory[],
): { readonly ordered: RecalledMemory[]; readonly ranked: boolean } {
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0 || memories.length === 0) {
    return { ordered: [...memories], ranked: false };
  }

  const docs = memories.map((m) => tokenSet(m.body));
  const totalLen = docs.reduce((sum, d) => sum + d.size, 0);
  const avgLen = totalLen / docs.length;
  if (avgLen === 0) return { ordered: [...memories], ranked: false };

  const idf = new Map<string, number>();
  for (const token of queryTokens) {
    const df = docs.reduce((n, d) => n + (d.has(token) ? 1 : 0), 0);
    idf.set(token, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)));
  }

  const scores = docs.map((doc) => {
    const lenNorm = BM25_K1 * (1 - BM25_B + (BM25_B * doc.size) / avgLen);
    let score = 0;
    for (const token of queryTokens) {
      if (doc.has(token)) score += ((idf.get(token) ?? 0) * (BM25_K1 + 1)) / (1 + lenNorm);
    }
    return score;
  });

  const ranked = scores.some((s) => s > 0);
  if (!ranked) return { ordered: [...memories], ranked: false };

  const ordered = memories
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => {
      const diff = scores[b.index] - scores[a.index];
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.memory);
  return { ordered, ranked: true };
}

/**
 * The outcome of a rerank pass: the reordered list + which reranker actually
 * ran. `reason` is set ONLY when ColBERT did not rank a multi-memory pool (a
 * real degrade) — the ≤1-memory short-circuit is trivially ranked, not degraded.
 */
export interface RerankOutcome {
  readonly ordered: readonly RecalledMemory[];
  readonly reranker: 'colbert' | 'lexical' | 'identity';
  readonly reason?: string;
}

/** Degrade path: lexical fallback over the score-ordered pool, truthfully labelled. */
function degradeToLexical(
  query: string,
  scoreOrdered: readonly RecalledMemory[],
  reason: string,
): RerankOutcome {
  const fallback = lexicalRerank(query, scoreOrdered);
  return fallback.ranked
    ? { ordered: fallback.ordered, reranker: 'lexical', reason }
    : { ordered: scoreOrdered, reranker: 'identity', reason };
}

/**
 * Reorder `memories` by ColBERT late-interaction relevance to `query`. When the
 * reranker is unavailable/faulted, degrades to the BM25-ish lexical fallback
 * (`reranker: 'lexical'`), and to source-score order (`'identity'`) only when
 * the query has zero lexical signal — always with a truthful `reason`. Never
 * throws.
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return degradeToLexical(query, scoreOrdered, `colbert reranker faulted: ${detail}`);
  }

  if (!result.available) {
    return degradeToLexical(query, scoreOrdered, 'colbert reranker unavailable (torch/sidecar absent)');
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
