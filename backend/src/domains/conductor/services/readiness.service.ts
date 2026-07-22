/**
 * ReadinessService — a PURE fold of the four merge-decision signals a reviewer
 * weighs before merging a workspace into one truthful read-model (the
 * `GET /workspaces/:id/readiness` payload). It has NO side effects: it takes the
 * already-probed views (lifecycle state, mergeability, PR checks, preview
 * verification) and derives a verdict + the four constituent signals + any hard
 * blockers.
 *
 * The whole file obeys ONE law: DEGRADE-TRUTHFUL. A signal we could not judge is
 * `'unknown'` (never a fabricated pass); a `'ready'` verdict is the HARDEST gate —
 * it is returned ONLY when the merge preflight is a real `available && clean`
 * pass, the lifecycle is review-terminal, checks are not failing, and the preview
 * is not a hard fail. When the crux merge signal is unavailable (git-too-old, no
 * worktree) and no hard blocker exists, the verdict is `'unknown'` — we could not
 * judge, so we say so, rather than green-lighting a merge on a blind gate.
 *
 * Only conductor-internal + agent-os (already-used) TYPE imports — no cross-domain
 * value import (the composer injects the concrete probes; this service is pure).
 */
import type { WorkspaceState } from '@recoder/agent-os';
import type { AttentionState } from '../types.js';
import type { MergeabilityView } from './mergeability.service.js';
import type { PrStatusView } from './pr-status.service.js';
import type { PreviewVerificationView } from '../ports/preview-verify.port.js';

/** One of the four merge-decision signals, projected truthfully. */
export interface ReadinessSignal {
  readonly id: 'lifecycle' | 'merge' | 'checks' | 'preview';
  /** `'unknown'` is a real value (we could not judge) — never coerced to a pass. */
  readonly status: 'pass' | 'fail' | 'pending' | 'unknown';
  readonly detail: string;
}

/** The folded read-model the `GET /workspaces/:id/readiness` edge returns. */
export interface ReadinessView {
  /** The overall merge verdict — `'ready'` is the hardest gate (see the fold rules). */
  readonly verdict: 'ready' | 'blocked' | 'not_ready' | 'unknown';
  /** ALWAYS 4 signals, fixed order: lifecycle, merge, checks, preview. */
  readonly signals: readonly ReadinessSignal[];
  /** Populated ONLY on hard blockers (a real merge conflict or a failing check). */
  readonly blockers: readonly string[];
}

/** The already-probed inputs the fold reads — each optional so it degrades independently. */
export interface ReadinessInput {
  readonly state: WorkspaceState;
  readonly attention?: AttentionState;
  /** Absent ⇒ the merge probe rejected / was unavailable. */
  readonly mergeability?: MergeabilityView;
  readonly prStatus?: PrStatusView;
  /** `null` ⇒ never verified; absent ⇒ the probe rejected. */
  readonly preview?: PreviewVerificationView | null;
}

/**
 * REVIEW-TERMINAL: the work is reviewable (review → merge flow). True when the
 * durable state is `awaiting_review`/`merging`, OR the live attention classifier
 * says `review_ready` (the agent settled with reviewable work).
 */
function isReviewTerminal(state: WorkspaceState, attention?: AttentionState): boolean {
  return state === 'awaiting_review' || state === 'merging' || attention === 'review_ready';
}

/** Lifecycle signal — a review-terminal workspace passes; otherwise the agent is still working. */
function deriveLifecycle(
  state: WorkspaceState,
  reviewTerminal: boolean,
): ReadinessSignal {
  return reviewTerminal
    ? { id: 'lifecycle', status: 'pass', detail: `workspace is reviewable (state '${state}')` }
    : { id: 'lifecycle', status: 'pending', detail: `agent still working (state '${state}')` };
}

/** Merge signal — NEVER a pass on an unavailable/unknown preflight (the truthful degrade). */
function deriveMerge(mergeability?: MergeabilityView): ReadinessSignal {
  if (!mergeability) {
    return { id: 'merge', status: 'unknown', detail: 'merge preflight unavailable' };
  }
  if (mergeability.available && mergeability.verdict === 'clean') {
    return { id: 'merge', status: 'pass', detail: 'trial merge is clean' };
  }
  if (mergeability.available && mergeability.verdict === 'conflicting') {
    return {
      id: 'merge',
      status: 'fail',
      detail: `${mergeability.conflicts.length} conflicting path(s)`,
    };
  }
  // available:false / verdict 'unknown' (git-too-old, no worktree) — we could not judge.
  return {
    id: 'merge',
    status: 'unknown',
    detail: mergeability.reason ?? 'could not judge mergeability',
  };
}

/** Checks signal — only `available && rollup 'failing'` is a hard fail; else truthful. */
function deriveChecks(prStatus?: PrStatusView): ReadinessSignal {
  if (!prStatus || prStatus.available === false) {
    return { id: 'checks', status: 'unknown', detail: prStatus?.reason ?? 'checks unavailable' };
  }
  const checks = prStatus.checks;
  if (!checks) {
    return { id: 'checks', status: 'unknown', detail: 'no checks reported' };
  }
  switch (checks.rollup) {
    case 'failing':
      return {
        id: 'checks',
        status: 'fail',
        detail: `${checks.failed} of ${checks.total} checks failing`,
      };
    case 'passing':
      return {
        id: 'checks',
        status: 'pass',
        detail: `${checks.passed} of ${checks.total} checks passing`,
      };
    case 'pending':
      return {
        id: 'checks',
        status: 'pending',
        detail: `${checks.pending} of ${checks.total} checks pending`,
      };
    default:
      // 'none' — no PR / no checks reported.
      return { id: 'checks', status: 'unknown', detail: 'no checks reported' };
  }
}

/** Preview signal — a DEGRADED preview proves NOTHING (unknown, never pass/fail). */
function derivePreview(preview?: PreviewVerificationView | null): ReadinessSignal {
  if (!preview) {
    return { id: 'preview', status: 'unknown', detail: 'preview not verified' };
  }
  if (preview.degraded === true) {
    return {
      id: 'preview',
      status: 'unknown',
      detail: preview.reason ?? 'preview engine unavailable',
    };
  }
  switch (preview.status) {
    case 'passed':
      return { id: 'preview', status: 'pass', detail: preview.summary };
    case 'failed':
      return { id: 'preview', status: 'fail', detail: preview.summary };
    default:
      // 'skipped' — a truthful skip, never a pass.
      return { id: 'preview', status: 'unknown', detail: preview.summary || 'preview skipped' };
  }
}

/**
 * Compute the hard blockers — populated ONLY when the merge preflight is a real
 * conflict OR checks are failing. A conflicting merge lists the conflicted paths
 * (or a truthful placeholder when git could not name them); a failing check names
 * the count.
 */
function deriveBlockers(
  merge: ReadinessSignal,
  checks: ReadinessSignal,
  input: ReadinessInput,
): readonly string[] {
  const blockers: string[] = [];
  if (merge.status === 'fail') {
    const conflicts = input.mergeability?.conflicts ?? [];
    if (conflicts.length > 0) blockers.push(...conflicts);
    else blockers.push('merge conflicts (paths unavailable)');
  }
  if (checks.status === 'fail') {
    blockers.push(`${input.prStatus?.checks?.failed ?? 0} check(s) failing`);
  }
  return blockers;
}

/**
 * Fold the four merge-decision signals into one truthful {@link ReadinessView}.
 * PURE — no I/O, no mutation. The verdict priority (degrade-truthful, `ready` is
 * the hardest gate):
 *
 *   1. a hard merge conflict OR a failing check ⇒ BLOCKED (with the blockers);
 *   2. else not review-terminal ⇒ NOT_READY (the agent is still working);
 *   3. else merge is a real clean pass AND preview is not a hard fail ⇒ READY;
 *   4. else the merge signal is unknown ⇒ UNKNOWN (crux gate unjudgeable, no
 *      hard blocker — we could not judge, so we say so, never a blind green);
 *   5. else ⇒ NOT_READY (review-terminal + clean merge, but a hard preview fail —
 *      a real negative that is not a merge/checks blocker).
 */
export function foldReadiness(input: ReadinessInput): ReadinessView {
  const reviewTerminal = isReviewTerminal(input.state, input.attention);
  const lifecycle = deriveLifecycle(input.state, reviewTerminal);
  const merge = deriveMerge(input.mergeability);
  const checks = deriveChecks(input.prStatus);
  const preview = derivePreview(input.preview);
  const signals: readonly ReadinessSignal[] = [lifecycle, merge, checks, preview];

  if (merge.status === 'fail' || checks.status === 'fail') {
    return { verdict: 'blocked', signals, blockers: deriveBlockers(merge, checks, input) };
  }
  if (!reviewTerminal) {
    return { verdict: 'not_ready', signals, blockers: [] };
  }
  if (merge.status === 'pass' && preview.status !== 'fail') {
    return { verdict: 'ready', signals, blockers: [] };
  }
  if (merge.status === 'unknown') {
    return { verdict: 'unknown', signals, blockers: [] };
  }
  return { verdict: 'not_ready', signals, blockers: [] };
}
