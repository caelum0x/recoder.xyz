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
 *  - The RAW DIFF never rides the readiness payload. The shared bounded impact
 *    ledger does, unchanged, so readiness and installed PR review expose the
 *    same files, tests, directions, depth, risk, and evidence scope.
 */
import type { CodeImpactLedger } from '../../../shared/code-impact-ledger.js';

/** The same bounded ledger carried by PR agents and Wave. */
export type PrReviewImpactView = CodeImpactLedger;

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
  /** The shared bounded impact ledger; absent when the review failed. */
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
