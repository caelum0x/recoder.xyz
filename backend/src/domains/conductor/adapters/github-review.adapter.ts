/**
 * GithubPrReviewAdapter — concrete {@link PrReviewPort} over the engines
 * GithubModule's `reviewPR` (gh pr view + bounded diff + recodergit
 * blast-radius impact), the W10-A "auto-review at delivery" seam.
 *
 * TYPE-ONLY coupling: the conductor never value-imports the engines domain —
 * this adapter declares the STRUCTURAL {@link GithubReviewFacet} slice it
 * drives, and bootstrap injects the concrete closure (`() => engines.github()`),
 * resolved per probe so the seam follows the live module.
 *
 * SEAM LAW (degrade-truthful, bounded): a failed InvokeResult (gh missing /
 * unauthenticated / no PR) and a THROWING facet both fold into a truthful
 * `available:false` + reason — never a fabricated review, never a throw across
 * the readiness read. The RAW DIFF never leaves this adapter: the projection
 * carries only the truncation flag and the already-bounded shared impact ledger.
 */
import type { Logger } from '../../../shared/logger.js';
import type { CodeImpactLedger } from '../../../shared/code-impact-ledger.js';
import type {
  PrReviewEvidenceView,
  PrReviewImpactView,
  PrReviewPort,
} from '../ports/pr-review.port.js';

/**
 * The `reviewPR` success payload (structural mirror of the engines shape —
 * `github-module.ts` `reviewPR`). The normalized impact ledger is the shared
 * cross-domain contract; raw per-symbol engine readings are deliberately absent.
 */
export interface GithubReviewValue {
  readonly pr: unknown;
  readonly diff: string | null;
  readonly diffTruncated: boolean;
  readonly diffUnavailable?: string;
  readonly impact: CodeImpactLedger;
}

/** Structural slice of the engines `InvokeResult` (no cross-domain value import). */
export type GithubReviewInvokeResult =
  | { readonly ok: true; readonly value: GithubReviewValue }
  | { readonly ok: false; readonly reason: string; readonly code?: string };

/** The structural GithubModule slice this adapter drives (`engines.github()`). */
export interface GithubReviewFacet {
  reviewPR(input: {
    readonly pr: string;
    readonly repoRoot: string;
  }): Promise<GithubReviewInvokeResult>;
}

export interface GithubPrReviewAdapterDeps {
  /** Late-resolved engines facet (`() => engines.github()`) — resolved per probe. */
  readonly github: () => GithubReviewFacet;
  readonly logger: Logger;
}

/** Copy the shared ledger without leaking the raw per-symbol engine readings. */
function projectImpact(impact: GithubReviewValue['impact']): PrReviewImpactView {
  return {
    available: impact.available,
    ...(impact.reason ? { reason: impact.reason } : {}),
    source: impact.source,
    scope: impact.scope,
    risk: impact.risk,
    partial: impact.partial,
    files: impact.files,
    tests: impact.tests,
    processes: impact.processes,
    consumers: impact.consumers,
    summary: impact.summary,
  };
}

export function createGithubPrReviewAdapter(
  deps: GithubPrReviewAdapterDeps,
): PrReviewPort {
  const { logger } = deps;
  return {
    async review(input): Promise<PrReviewEvidenceView> {
      try {
        const result = await deps.github().reviewPR({
          pr: String(input.prNumber),
          repoRoot: input.repoRoot,
        });
        if (!result.ok) {
          logger.warn(
            { workspaceId: input.workspaceId, pr: input.prNumber, reason: result.reason },
            'pr auto-review unavailable — reporting truthfully',
          );
          return { available: false, reason: result.reason, pr: input.prNumber };
        }
        const { value } = result;
        return {
          available: true,
          pr: input.prNumber,
          // A failed diff is a PARTIAL degrade: the gh view ran, so the review
          // stays available with the truthful diff-unavailable reason attached.
          ...(value.diffUnavailable ? { reason: value.diffUnavailable } : {}),
          ...(value.diffTruncated ? { diffTruncated: true } : {}),
          impact: projectImpact(value.impact),
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'pr review failed';
        logger.warn(
          { err, workspaceId: input.workspaceId, pr: input.prNumber },
          'pr auto-review faulted — reporting unavailable',
        );
        return { available: false, reason, pr: input.prNumber };
      }
    },
  };
}
