/**
 * recall/dedupe — near-duplicate collapse for fused recall.
 *
 * Different sources (mem0 distillation, a beads wisp, a durable item) often carry
 * the SAME fact in slightly different words. After rerank we walk the ordered list
 * and drop any memory whose normalized token set is ≥ `threshold` similar (Jaccard)
 * to one we already kept — so the caller sees each fact once, keeping the
 * best-ranked (first-seen) copy and its provenance.
 *
 * Pure + deterministic: no I/O, no mutation of the input array. Identical bodies
 * always collapse (Jaccard = 1); the threshold only governs how aggressively
 * near-duplicates fold. `threshold >= 1` collapses only exact token-set matches;
 * `threshold <= 0` would collapse everything with any overlap, so callers pass the
 * configured `dedupeThreshold` (default 0.9).
 */
import type { RecalledMemory } from '../types.js';

/** Lowercase, strip punctuation, split into a set of non-empty word tokens. */
export function tokenSet(text: string): ReadonlySet<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return new Set(tokens);
}

/** Jaccard similarity of two token sets, in `[0, 1]` (0 when either is empty). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Collapse near-duplicate memories, preserving input order (best-first). The
 * first occurrence of each near-duplicate cluster is kept; later members whose
 * body is ≥ `threshold` similar to a kept member are dropped. Returns a new array.
 */
export function dedupeMemories(
  memories: readonly RecalledMemory[],
  threshold: number,
): RecalledMemory[] {
  const kept: RecalledMemory[] = [];
  const keptTokens: ReadonlySet<string>[] = [];

  for (const memory of memories) {
    const tokens = tokenSet(memory.body);
    const isDuplicate = keptTokens.some((existing) => jaccard(tokens, existing) >= threshold);
    if (isDuplicate) continue;
    kept.push(memory);
    keptTokens.push(tokens);
  }

  return kept;
}
