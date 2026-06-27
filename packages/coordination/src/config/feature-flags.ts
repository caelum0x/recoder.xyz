/**
 * Feature flags — coordination behavior toggles. Defaults per design §10
 * (`autoHeal=true`, `dispatchDryRun=false`, `handoffApprovalGate=true`).
 */

export type CoordinationFeatureFlags = {
  /** Reconciler auto-heals provably-safe drift when true. */
  autoHeal: boolean;
  /** Dispatch computes a decision but commits no claim/locks when true. */
  dispatchDryRun: boolean;
  /** Gated handoffs route through the approval gate when true. */
  handoffApprovalGate: boolean;
};

export const DEFAULT_FEATURE_FLAGS: CoordinationFeatureFlags = {
  autoHeal: true,
  dispatchDryRun: false,
  handoffApprovalGate: true,
};
