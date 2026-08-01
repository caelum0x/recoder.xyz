/**
 * PrReviewPort — the conductor's ADVISORY auto-review seam for the merge-
 * readiness read model (`GET …/workspaces/:id/readiness`). When the workspace
 * has a real open PR, the readiness composer fires this port so the reviewer's
 * merge decision includes an AI-annotated PR review (gh pr view + bounded diff
 * + recodergit blast-radius impact) — the convergence "trusted merge" evidence.
 *
 * The conductor MUST NOT value-import the engines domain; it depends on this
 * narrow, conductor-owned port that bootstrap satisfies with a concrete
 * GithubModule closure (mirrors {@link RunSignalPushPort} / `CodeIntelPort`).
 * Set post-construction by `ConductorModule.setPrReview`.
 *
 * SEAM LAW (degrade-truthful, advisory-only):
 *  - Unwired / no PR / no worktree / a rejecting port ⇒ the readiness `review`
 *    facet is simply ABSENT (`null`) — NEVER a 6th signal, NEVER a verdict
 *    change, and the readiness read never 500s on this seam.
 *  - gh missing / unauthenticated / a failed review ⇒ `available:false` with a
 *    truthful reason — never a fabricated review.
 *  - The RAW DIFF never rides the readiness payload — only a bounded projection
 *    (truncation flag + a capped top-symbols blast radius).
 */

/** One changed symbol's bounded blast-radius reading (reference count only). */
export interface PrReviewImpactSymbol {
  readonly symbol: string;
  /** Upstream reference count read from the code-graph (0 when unreadable). */
  readonly references: number;
}

/**
 * The bounded recodergit blast-radius projection. `available` is true only when
 * the code-graph produced at least one real reading; otherwise `reason` states
 * the truthful cause (code-graph disabled / repo not indexed / no symbols).
 */
export interface PrReviewImpactView {
  readonly available: boolean;
  readonly reason?: string;
  /** How many changed symbols the engine scored (pre-truncation). */
  readonly symbolCount: number;
  /** The highest-reference changed symbols, capped — never the full graph. */
  readonly topSymbols: readonly PrReviewImpactSymbol[];
}

/** The bounded, advisory review evidence the readiness read model carries. */
export interface PrReviewEvidenceView {
  /** True only when the underlying `gh pr view` review really ran. */
  readonly available: boolean;
  /** Why the review is unavailable / partially degraded (truthful cause). */
  readonly reason?: string;
  /** The reviewed PR number (echoed even on an unavailable review). */
  readonly pr: number;
  /** True when the bounded diff was cut at the engine's cap. */
  readonly diffTruncated?: boolean;
  /** The bounded blast-radius projection; absent when the review failed. */
  readonly impact?: PrReviewImpactView;
}

/** The narrow advisory auto-review seam the readiness composer probes through. */
export interface PrReviewPort {
  /** Review the workspace's open PR — bounded projection, never the raw diff. */
  review(input: {
    readonly prNumber: number;
    readonly repoRoot: string;
    readonly workspaceId: string;
  }): Promise<PrReviewEvidenceView>;
}
