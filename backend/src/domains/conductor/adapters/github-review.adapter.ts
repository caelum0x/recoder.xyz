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
 * carries only the truncation flag and a CAPPED top-symbols blast radius.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  PrReviewEvidenceView,
  PrReviewImpactView,
  PrReviewPort,
} from '../ports/pr-review.port.js';

/** Cap the top-symbols projection so a huge PR never bloats the readiness payload. */
export const MAX_TOP_SYMBOLS = 5;

/**
 * The `reviewPR` success payload (structural mirror of the engines shape —
 * `github-module.ts` `reviewPR`; per-symbol readings stay UNKNOWN-shaped).
 */
export interface GithubReviewValue {
  readonly pr: unknown;
  readonly diff: string | null;
  readonly diffTruncated: boolean;
  readonly diffUnavailable?: string;
  readonly impact: {
    readonly available: boolean;
    readonly reason?: string;
    readonly changedSymbols: readonly string[];
    readonly symbols: readonly {
      readonly symbol: string;
      readonly references: unknown;
      readonly callGraph: unknown;
      readonly reason?: string;
    }[];
  };
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

/**
 * Count the upstream references out of the engine's UNKNOWN-shaped
 * `find_references` reading. Truthful floor: an unreadable shape counts 0 —
 * never a fabricated blast radius.
 */
export function countReferences(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value === null || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  for (const key of ['references', 'results', 'items', 'matches']) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested.length;
  }
  for (const key of ['count', 'total']) {
    const nested = record[key];
    if (typeof nested === 'number' && Number.isFinite(nested) && nested >= 0) {
      return nested;
    }
  }
  return 0;
}

/** Project the engine impact annotation into the bounded top-symbols view. */
function projectImpact(impact: GithubReviewValue['impact']): PrReviewImpactView {
  const topSymbols = impact.symbols
    .map((s) => ({ symbol: s.symbol, references: countReferences(s.references) }))
    .sort((a, b) => b.references - a.references)
    .slice(0, MAX_TOP_SYMBOLS);
  return {
    available: impact.available,
    ...(impact.reason ? { reason: impact.reason } : {}),
    symbolCount: impact.symbols.length,
    topSymbols,
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
