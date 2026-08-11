/**
 * Attention priority — pure ranking helpers that let a space/board build a real
 * "jump to the one that needs you" queue over per-workspace {@link AttentionState}
 * classifications, without changing `classifyAttention`'s per-workspace contract.
 *
 * The ordering is herdr's status precedence re-expressed for our vocabulary:
 * blocked/awaiting-a-decision outranks a failure, which outranks a finished
 * (done/review-ready) turn, which outranks active work, which outranks a settled
 * idle prompt, which outranks a truthful `unknown` (no signal). Higher rank =
 * more urgent = surface first.
 *
 * Clean-room note: precedence absorbed from herdr (Apache-2.0) by design only —
 * no code was copied.
 *
 * `done` vs `idle-seen`: a workspace that FINISHED while the user was away
 * (completed RunEvent / review-ready, not yet looked at) `needs a look` and
 * outranks one the user has ALREADY seen. This is the `seen` tiebreak in
 * {@link effectiveRank}: an unseen state edges out the same state already seen,
 * but never crosses into a different state tier.
 */
import type { AttentionState } from '../types.js';

/**
 * Base urgency of an attention state (higher = more urgent). `error` sits just
 * below `awaiting_approval` — a failed turn needs a look but a blocked decision
 * needs an action first; `review_ready` is the "done, needs review" tier.
 */
const RANK: Readonly<Record<AttentionState, number>> = {
  awaiting_approval: 5,
  error: 4,
  review_ready: 3,
  working: 2,
  agent_idle_prompt: 1,
  unknown: 0,
};

/** Pure base rank of an attention state (higher = more urgent). */
export function attentionRank(state: AttentionState): number {
  return RANK[state];
}

/** A workspace's attention plus whether the user has already looked at it. */
export interface AttentionRankInput {
  readonly attention: AttentionState;
  /** True once the user has seen this workspace since it reached its state. */
  readonly seen?: boolean;
}

/**
 * Effective rank folding the `done` vs `idle-seen` distinction into the base
 * order: an UNSEEN state (`needs a look`) edges out the SAME state already seen,
 * while the base state tier still dominates across different states.
 */
export function effectiveRank(input: AttentionRankInput): number {
  return attentionRank(input.attention) * 2 + (input.seen ? 0 : 1);
}

/**
 * Pick the single most-urgent workspace from a space/board aggregate (max rank,
 * unseen breaking ties). Returns `null` for an empty list — the truthful answer
 * when nothing needs you.
 */
export function rankAttentions<T extends AttentionRankInput>(
  list: readonly T[]
): T | null {
  let best: T | null = null;
  let bestRank = -Infinity;
  for (const item of list) {
    const rank = effectiveRank(item);
    if (rank > bestRank) {
      best = item;
      bestRank = rank;
    }
  }
  return best;
}
