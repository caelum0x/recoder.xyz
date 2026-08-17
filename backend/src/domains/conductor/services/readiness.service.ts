/**
 * ReadinessService — a PURE fold of the six merge-decision signals a reviewer
 * weighs before merging a workspace into one truthful read-model (the
 * `GET /workspaces/:id/readiness` payload). It has NO side effects: it takes the
 * already-probed views (lifecycle state, worktree, mergeability, PR checks, preview
 * verification, open work) and derives a verdict + the six constituent signals +
 * any hard blockers + soft open-work advisories.
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
import type { WorktreeStatusView } from './worktree-status.service.js';
import type { PreviewVerificationView } from '../ports/preview-verify.port.js';
import type { PrReviewEvidenceView } from '../ports/pr-review.port.js';
import type { OpenWorkView } from './openwork.service.js';

/** One of the six merge-decision signals, projected truthfully. */
export interface ReadinessSignal {
  readonly id: 'lifecycle' | 'worktree' | 'merge' | 'checks' | 'preview' | 'openWork';
  /** `'unknown'` is a real value (we could not judge) — never coerced to a pass. */
  readonly status: 'pass' | 'fail' | 'pending' | 'unknown';
  readonly detail: string;
}

/** The open pull request's identity, surfaced so the reviewer can see/link it. */
export interface ReadinessPr {
  readonly number: number;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly url: string;
}

/** The folded read-model the `GET /workspaces/:id/readiness` edge returns. */
export interface ReadinessView {
  /**
   * The overall merge verdict — `'ready'` is the hardest gate (see the fold
   * rules). `'delivered'` (already merged) and `'terminal'` (archived/cancelled)
   * are decided by lifecycle truth: a converged/closed workspace is NEVER folded
   * to `'not_ready'` with an "agent still working" detail.
   */
  readonly verdict: 'ready' | 'blocked' | 'not_ready' | 'unknown' | 'delivered' | 'terminal';
  /** ALWAYS 6 signals, fixed order: lifecycle, worktree, merge, checks, preview, openWork. */
  readonly signals: readonly ReadinessSignal[];
  /** Populated ONLY on hard blockers (a real merge conflict or a failing check). */
  readonly blockers: readonly string[];
  /**
   * SOFT "discouraged" reasons — unresolved open work that downgrades a `ready`
   * merge to `not_ready` without hard-blocking it: unchecked task-spec criteria,
   * added TODO/FIXME diff markers, and non-closed linked issues. Empty when there
   * is no open work OR the open-work source could not be probed. Distinct from
   * {@link blockers} (hard conflict/failing-check) so the reviewer sees both tiers.
   */
  readonly advisories: readonly string[];
  /** The open PR's identity (number/state/draft/url); null when there is no PR. */
  readonly pr: ReadinessPr | null;
  /**
   * ADVISORY AI review evidence (the bounded `reviewPR` projection: gh pr view
   * + diff-truncation flag + recodergit blast radius). NEVER a 6th signal and
   * NEVER folded into the verdict — pure pass-through evidence. `null` when the
   * probe was unwired/skipped/rejected (truthful absence).
   */
  readonly review: PrReviewEvidenceView | null;
}

/** The already-probed inputs the fold reads — each optional so it degrades independently. */
export interface ReadinessInput {
  readonly state: WorkspaceState;
  readonly attention?: AttentionState;
  /** Absent ⇒ the merge probe rejected / was unavailable. */
  readonly mergeability?: MergeabilityView;
  readonly prStatus?: PrStatusView;
  /** Absent ⇒ the worktree-status probe rejected / was unavailable. */
  readonly worktree?: WorktreeStatusView;
  /** `null` ⇒ never verified; absent ⇒ the probe rejected. */
  readonly preview?: PreviewVerificationView | null;
  /** ADVISORY auto-review evidence; absent ⇒ probe unwired/skipped/rejected. */
  readonly review?: PrReviewEvidenceView;
  /** Unresolved open work (criteria/TODOs/linked issues); absent ⇒ probe rejected/unwired. */
  readonly openWork?: OpenWorkView;
}

/**
 * The lifecycle bucket a state falls in — the fold reads this instead of a bare
 * "reviewable | not" boolean so that DELIVERED and closed TERMINAL states are told
 * apart from a genuinely pre-review "still working" state.
 *
 * - `reviewable`  the work is reviewable (review → merge flow);
 * - `delivered`   already merged (the convergence completed) — a real positive;
 * - `terminal`    archived/cancelled (closed) — neither working nor a merge target;
 * - `failed`      the delivery failed (recoverable, but a real negative);
 * - `working`     genuinely pre-review (created/setting_up/ready/running/
 *                 awaiting_approval/changes_requested) — the agent is still working.
 */
type LifecycleClass = 'reviewable' | 'delivered' | 'terminal' | 'failed' | 'working';

/**
 * REVIEW-TERMINAL: the work is reviewable (review → merge flow). True when the
 * durable state is `awaiting_review`/`merging`, OR the live attention classifier
 * says `review_ready` (the agent settled with reviewable work).
 */
function isReviewTerminal(state: WorkspaceState, attention?: AttentionState): boolean {
  return state === 'awaiting_review' || state === 'merging' || attention === 'review_ready';
}

/** Bucket a workspace state into its {@link LifecycleClass} (reviewable wins over all). */
function classifyLifecycle(state: WorkspaceState, attention?: AttentionState): LifecycleClass {
  if (isReviewTerminal(state, attention)) return 'reviewable';
  if (state === 'merged') return 'delivered';
  if (state === 'archived' || state === 'cancelled') return 'terminal';
  if (state === 'failed') return 'failed';
  return 'working';
}

/**
 * Lifecycle signal — a reviewable OR delivered (merged) workspace passes; a closed
 * terminal state is `'unknown'` (nothing to judge); a failed delivery is a hard
 * `'fail'`; only a genuinely pre-review state reports the agent is still working.
 */
function deriveLifecycle(state: WorkspaceState, lifecycleClass: LifecycleClass): ReadinessSignal {
  switch (lifecycleClass) {
    case 'reviewable':
      return { id: 'lifecycle', status: 'pass', detail: `workspace is reviewable (state '${state}')` };
    case 'delivered':
      return { id: 'lifecycle', status: 'pass', detail: 'workspace merged' };
    case 'failed':
      return { id: 'lifecycle', status: 'fail', detail: 'workspace failed' };
    case 'terminal':
      return { id: 'lifecycle', status: 'unknown', detail: `workspace ${state}` };
    default:
      return { id: 'lifecycle', status: 'pending', detail: `agent still working (state '${state}')` };
  }
}

/**
 * Worktree signal — a clean worktree passes; UNCOMMITTED work is `'pending'` (open
 * work: it DISCOURAGES a merge without hard-blocking it, since the merge operates
 * on committed state); an unavailable probe is `'unknown'`, never a fabricated
 * clean pass.
 */
function deriveWorktree(worktree?: WorktreeStatusView): ReadinessSignal {
  if (!worktree || worktree.available === false) {
    return { id: 'worktree', status: 'unknown', detail: worktree?.reason ?? 'worktree status unavailable' };
  }
  if (worktree.dirty) {
    return {
      id: 'worktree',
      status: 'pending',
      detail: `${worktree.changedCount} uncommitted change(s) — commit before merging`,
    };
  }
  return { id: 'worktree', status: 'pass', detail: 'worktree clean' };
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

/** PR identity projection — null unless a real PR with a number was found. */
function derivePr(prStatus?: PrStatusView): ReadinessPr | null {
  if (!prStatus || prStatus.hasPr !== true || typeof prStatus.number !== 'number') {
    return null;
  }
  return {
    number: prStatus.number,
    state: prStatus.state ?? 'open',
    draft: prStatus.draft === true,
    url: prStatus.url ?? '',
  };
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
 * Open-work signal — unresolved work DISCOURAGES a merge (soft, like uncommitted
 * worktree). `pending` when any open-work item was found; `pass` when a probed
 * source found none; `unknown` when no source could be probed (never a fabricated
 * pass). The detail summarizes the counts by kind.
 */
function deriveOpenWork(openWork?: OpenWorkView): ReadinessSignal {
  if (!openWork || openWork.available === false) {
    return { id: 'openWork', status: 'unknown', detail: openWork?.reason ?? 'open-work status unavailable' };
  }
  const items = openWork.items;
  if (items.length === 0) {
    return { id: 'openWork', status: 'pass', detail: 'no unresolved open work' };
  }
  const criteria = items.filter((i) => i.kind === 'criterion').length;
  const todos = items.filter((i) => i.kind === 'todo').length;
  const issues = items.filter((i) => i.kind === 'issue').length;
  const parts: string[] = [];
  if (criteria > 0) parts.push(`${criteria} unchecked criteria`);
  if (todos > 0) parts.push(`${todos} TODO/FIXME`);
  if (issues > 0) parts.push(`${issues} open issue(s)`);
  return { id: 'openWork', status: 'pending', detail: `${parts.join(', ')} — resolve before merging` };
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
 * Fold the six merge-decision signals into one truthful {@link ReadinessView}.
 * PURE — no I/O, no mutation. The verdict priority (degrade-truthful, `ready` is
 * the hardest gate):
 *
 *   1. already merged ⇒ DELIVERED (the convergence completed — decided by
 *      lifecycle truth, never re-litigated by a stale merge/checks probe);
 *   2. archived/cancelled ⇒ TERMINAL (closed — neither working nor a merge target);
 *   3. failed ⇒ BLOCKED (a real delivery failure, not "still working");
 *   4. a hard merge conflict OR a failing check ⇒ BLOCKED (with the blockers);
 *   5. else still pre-review (working) ⇒ NOT_READY (the agent is still working);
 *   6. else merge is a real clean pass AND preview is not a hard fail:
 *        a. the worktree has uncommitted OPEN WORK ⇒ NOT_READY (discouraged —
 *           a soft downgrade so committed-state merge never silently drops it);
 *        b. else ⇒ READY;
 *   7. else the merge signal is unknown ⇒ UNKNOWN (crux gate unjudgeable, no
 *      hard blocker — we could not judge, so we say so, never a blind green);
 *   8. else ⇒ NOT_READY (review-terminal + clean merge, but a hard preview fail —
 *      a real negative that is not a merge/checks blocker).
 */
export function foldReadiness(input: ReadinessInput): ReadinessView {
  const lifecycleClass = classifyLifecycle(input.state, input.attention);
  const lifecycle = deriveLifecycle(input.state, lifecycleClass);
  const worktree = deriveWorktree(input.worktree);
  const merge = deriveMerge(input.mergeability);
  const checks = deriveChecks(input.prStatus);
  const preview = derivePreview(input.preview);
  const openWork = deriveOpenWork(input.openWork);
  const pr = derivePr(input.prStatus);
  // ADVISORY pass-through: the review evidence NEVER joins the signals array
  // and NEVER moves the verdict fold below — it rides the view untouched.
  const review = input.review ?? null;
  const signals: readonly ReadinessSignal[] = [lifecycle, worktree, merge, checks, preview, openWork];
  // Soft advisories — the itemized open work (criteria/TODOs/linked issues). Only
  // present when a source was probed AND found work; an unavailable probe carries
  // none (never fabricated). Rides every verdict (informational at any state).
  const advisories: readonly string[] =
    input.openWork && input.openWork.available ? input.openWork.items.map((i) => i.label) : [];

  /** Close over the shared parts so every verdict path stays one line + truthful. */
  const mk = (verdict: ReadinessView['verdict'], blockers: readonly string[] = []): ReadinessView => ({
    verdict,
    signals,
    pr,
    review,
    blockers,
    advisories,
  });

  // Delivered/closed states are decided by lifecycle truth BEFORE the merge/checks
  // fold: an already-merged or closed workspace is never reported as blocked or
  // "agent still working" on the panel meant to prove its convergence.
  if (lifecycleClass === 'delivered') {
    return mk('delivered');
  }
  if (lifecycleClass === 'terminal') {
    return mk('terminal');
  }
  if (lifecycleClass === 'failed') {
    return mk('blocked', ['workspace delivery failed']);
  }

  if (merge.status === 'fail' || checks.status === 'fail') {
    return mk('blocked', deriveBlockers(merge, checks, input));
  }
  if (lifecycleClass === 'working') {
    return mk('not_ready');
  }
  if (merge.status === 'pass' && preview.status !== 'fail') {
    // Open work DISCOURAGES a merge: uncommitted worktree changes would be silently
    // dropped (the merge operates on committed state), and unresolved criteria/TODOs/
    // linked issues mean the work isn't done. Both are SOFT downgrades to not_ready,
    // NOT hard blockers — the reviewer can still merge, but the panel tells the truth.
    if (worktree.status === 'pending' || openWork.status === 'pending') {
      return mk('not_ready');
    }
    return mk('ready');
  }
  if (merge.status === 'unknown') {
    return mk('unknown');
  }
  return mk('not_ready');
}
