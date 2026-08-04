/**
 * recall/scope-boost — the cross-RUN memory scoping stage (thesis §7: shared
 * team memory across runs is the compounding moat).
 *
 * v1/v2 recall fused + reranked by RELEVANCE. But relevance alone does not know
 * that a lesson harvested on repo X days ago should outrank a generic match when
 * a NEW run starts on repo X. This pure stage adds the two cross-RUN signals the
 * reranker cannot see, WITHOUT touching (or lying about) the reranker:
 *  - `repo-match`: the memory pertains to the run's repo. Harvest shaping embeds
 *    the repo name in every candidate body ("On <repo>, task …"), so a memory
 *    that carries ALL of the repo's basename tokens is a genuine repo hit.
 *  - `recency`: the memory was harvested inside the freshness window (a fresh
 *    lesson beats a stale one on the same footing).
 *
 * It reorders by BOOST WEIGHT with the reranked order as a STABLE tiebreak, so a
 * repo-matched / fresh memory rises above generic matches while the underlying
 * reranker order (and its degrade-truthful marker) is preserved untouched. Every
 * boosted memory is annotated with the signals that ranked it (`provenance.signals`)
 * so the audit trail shows WHY it surfaced. Pure + deterministic: no I/O, no
 * mutation of the input; identical inputs (same `nowMs`) → identical output.
 */
import { tokenSet } from './dedupe.js';
import { lexicalScore } from './rank.js';
import type { Provenance, RecallSignal, RecalledMemory } from '../types.js';

/** Freshness window for the recency boost: a lesson harvested inside 14 days. */
export const DEFAULT_RECENCY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Boost weights: a repo hit outranks a fresh-only hit, both outrank generic. */
const REPO_MATCH_WEIGHT = 2;
const RECENCY_WEIGHT = 1;

/** The context a scope-boost pass ranks against (all pure inputs). */
export interface ScopeBoostContext {
  /** The recall query (the base lexical-overlap signal). */
  readonly query: string;
  /** The repo the run targets (path/display); absent ⇒ no repo-match signal. */
  readonly repoRef?: string;
  /** Wall clock (ms) the recency window is measured against — injected for tests. */
  readonly nowMs: number;
  /** Override the freshness window (defaults to 14 days). */
  readonly recencyWindowMs?: number;
}

/** Last path segment of a repo ref (`/srv/recoder.xyz` → `recoder.xyz`). */
function basename(ref: string): string {
  const trimmed = ref.trim().replace(/[/\\]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

/**
 * Does `memory` pertain to the run's repo? True when EVERY token of the repo's
 * basename appears in the memory's title+body token set — so a body that cites
 * "On recoder.xyz, task …" matches repo `/srv/recoder.xyz`, while an unrelated
 * memory does not. Empty repo tokens ⇒ never a match (no fabricated repo hit).
 */
function repoMatches(memory: RecalledMemory, repoTokens: ReadonlySet<string>): boolean {
  if (repoTokens.size === 0) return false;
  const body = tokenSet(`${memory.title ?? ''} ${memory.body}`);
  if (body.size === 0) return false;
  for (const token of repoTokens) if (!body.has(token)) return false;
  return true;
}

/** Was `memory` harvested inside the freshness window? Unparseable/absent ⇒ no. */
function isFresh(memory: RecalledMemory, nowMs: number, windowMs: number): boolean {
  if (!memory.createdAt) return false;
  const created = Date.parse(memory.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created <= windowMs;
}

/** Return a provenance copy carrying the signals that surfaced the memory. */
function withSignals(provenance: Provenance, signals: readonly RecallSignal[]): Provenance {
  return { ...provenance, signals };
}

/**
 * Apply the cross-RUN scope boost: annotate every memory with WHY it surfaced
 * and reorder so repo-matched / fresh lessons rank above generic matches. When
 * no memory earns a boost (no repoRef, nothing fresh) the order is unchanged —
 * the reranker's order (and its truthful degrade marker) stands. Input is never
 * mutated; a new, reordered array is returned.
 */
export function applyScopeBoost(
  memories: readonly RecalledMemory[],
  ctx: ScopeBoostContext,
): RecalledMemory[] {
  if (memories.length === 0) return [];
  const repoTokens = ctx.repoRef ? tokenSet(basename(ctx.repoRef)) : new Set<string>();
  const windowMs = ctx.recencyWindowMs ?? DEFAULT_RECENCY_WINDOW_MS;

  const scored = memories.map((memory, index) => {
    const signals: RecallSignal[] = [];
    const repoMatch = repoMatches(memory, repoTokens);
    if (repoMatch) signals.push('repo-match');
    const fresh = isFresh(memory, ctx.nowMs, windowMs);
    if (fresh) signals.push('recency');
    if (lexicalScore(ctx.query, `${memory.title ?? ''} ${memory.body}`) > 0) signals.push('lexical');

    const weight = (repoMatch ? REPO_MATCH_WEIGHT : 0) + (fresh ? RECENCY_WEIGHT : 0);
    // Only rewrite provenance when there IS a reason to surface — an unsignalled
    // memory keeps its object identity (nothing fabricated onto it).
    const ranked = signals.length > 0 ? { ...memory, provenance: withSignals(memory.provenance, signals) } : memory;
    return { memory: ranked, index, weight };
  });

  // Descending boost weight; the reranked input order is the STABLE tiebreak, so
  // the reranker still decides order within a boost tier (degrade-truthful).
  scored.sort((a, b) => (b.weight - a.weight) || (a.index - b.index));
  return scored.map((entry) => entry.memory);
}
