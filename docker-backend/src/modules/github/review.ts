/**
 * review — the PR-review verb the GitHubModule exposes, composed over the
 * pr-swarm-review engine (conductor/github-engine/pr-review.ts). That engine
 * keeps its full exported API (compile / parameterize / verdict-parse); this
 * file only maps the module's (target, mode) into its input.
 *
 * Degrade-safe by delegation: reviewPullRequest never throws — invalid input,
 * missing auth, and a missing prompt pack all surface as truthful statuses.
 * Default mode is 'swarm' (parallel subagents) per the module interface.
 */

import type { PrReviewEngine } from './deps';
import type { PrTarget, ReviewResult, ReviewMode } from './types';

/** Delegate a PR review to the pr-swarm-review engine, defaulting to swarm mode. */
export function reviewPR(
  prReview: PrReviewEngine,
  target: PrTarget,
  mode: ReviewMode = 'swarm',
): Promise<ReviewResult> {
  return prReview.reviewPullRequest({ ...target, mode });
}
