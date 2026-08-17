/**
 * `ApprovalRepository` — the persistence contract for control-plane approval
 * records (`governance_approvals`). Backs the gate's `needs_approval` verdicts:
 * a risky action proceeds only when a matching `approved` record exists.
 *
 * Declared here; the concrete pg impl lives in
 * `repositories/approval-worklock.repository.ts`. Consumed by agent-os /
 * conductor via the `ApprovalService` (governance owns the table).
 */
import type { ApprovalRecord, ApprovalStatus, RiskTier } from '../types.js';

/** Fields to open a new approval request. */
export interface ApprovalRequestInput {
  readonly taskId?: string | null;
  readonly runId?: string | null;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly requestedBy: string;
  readonly reason?: string | null;
  /**
   * The action's concrete target (a path/command, derived like `resourceOf(ctx)`).
   * A concrete value clears the action ONLY on this exact target. Null/absent
   * values exist only on historical rows and never clear a new decision.
   */
  readonly target: string;
  /** ISO-8601 expiry; a `pending` record past this is treated as `expired`. */
  readonly expiresAt?: string | null;
}

/** A human decision on a pending approval. */
export interface ApprovalDecisionInput {
  readonly decision: 'approved' | 'denied';
  readonly decidedBy: string;
  readonly reason?: string | null;
}

/** Filter for listing approvals. */
export interface ApprovalQuery {
  readonly taskId?: string;
  readonly requestedBy?: string;
  readonly status?: ApprovalStatus;
  readonly limit?: number;
}

export interface ApprovalRepository {
  /** Insert a new `pending` approval record. */
  create(input: ApprovalRequestInput): Promise<ApprovalRecord>;

  /** Fetch one approval by id, or `null` when absent. */
  findById(id: string): Promise<ApprovalRecord | null>;

  /**
   * Apply a human decision to a `pending` record. Returns the updated record, or
   * `null` when the id is absent or the record was not `pending` (idempotent —
   * never re-decides a resolved record).
   */
  decide(id: string, input: ApprovalDecisionInput): Promise<ApprovalRecord | null>;

  /** List approvals matching the filter, newest first. */
  list(query?: ApprovalQuery): Promise<readonly ApprovalRecord[]>;

  /**
   * Whether an actionable `approved` (and not expired) record exists for the
   * given task+action — the evidence that clears a `needs_approval` verdict.
   *
   * Pass `requestedBy` to SCOPE the check to one requester. Omitting it answers
   * "approved for ANYONE" — which MUST NOT be used as per-actor gate clearance
   * (recoder-4d8i #6): one user's approval would otherwise clear another user's
   * gate on the same task+action.
   */
  hasApproval(taskId: string, action: string, requestedBy?: string): Promise<boolean>;
}
