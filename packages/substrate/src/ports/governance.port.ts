/**
 * GovernancePort + ApprovalGuardPort — the policy/approval seam (design §4.8 / §7).
 *
 * Outward-facing git actions (push / pr / merge) and sandbox creation are
 * approval-gated ABOVE the substrate. The substrate exposes the mechanism and
 * asks; governance decides. Every publish entry point calls `assertApproved`
 * first and throws if it is not satisfied — the substrate never bypasses a gate.
 * Interface only.
 */

/** The risky actions the substrate can perform that require approval. */
export type GovernedAction =
  | 'push'
  | 'pr'
  | 'merge'
  | 'sandbox_create'
  | 'teardown_remove';

export interface GovernanceContext {
  workspaceId: string;
  runId?: string;
  /** Actor requesting the action (for the approval record). */
  actor?: string;
  /** Non-secret detail for the approval decision (branch, base, remote). */
  detail?: Record<string, unknown>;
}

export interface GovernancePort {
  /**
   * Throw (a governance error) if the action is NOT approved for the context.
   * Resolves silently when the action is permitted.
   */
  assertApproved(action: GovernedAction, context: GovernanceContext): Promise<void>;
}

/**
 * ApprovalGuardPort — the narrow guard the publish/ module takes. Distinct from
 * the broader GovernancePort so publish entry points depend only on the single
 * capability they need (push/pr/merge gating).
 */
export interface ApprovalGuardPort {
  assertApproved(action: Extract<GovernedAction, 'push' | 'pr' | 'merge'>, context: GovernanceContext): Promise<void>;
}
