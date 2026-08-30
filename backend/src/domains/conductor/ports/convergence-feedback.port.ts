/**
 * Durable repository-scoped history of the human decisions that actually shipped
 * through convergence. This is evidence, not an authority shortcut: a prior pick
 * or a prior proceed-with-warning never auto-selects a future winner and never
 * suppresses a future trust flag by itself.
 */

export interface ConvergencePickDecision {
  readonly path: string;
  readonly sourceWorkspaceId: string;
  readonly sourceRuntime?: string;
}

export interface ConvergenceDecisionRecord {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly taskGroup: string | null;
  readonly mergedAt: string;
  readonly evidenceHash?: string;
  readonly picks: readonly ConvergencePickDecision[];
  readonly trustTier?: 'high' | 'medium' | 'low';
  readonly trustScore?: number;
  /** Flags the human proceeded with; this is not equivalent to dismissing them. */
  readonly proceededWithFlags: readonly string[];
}

export type ConvergenceFlagDispositionValue = 'accepted' | 'dismissed';
export type ConvergenceFlagFeedbackAction = ConvergenceFlagDispositionValue | 'clear';
export type RequiredRuleTrustMode = 'off' | 'warn' | 'block';

/** Operator-owned repository policy. Repository files cannot set this value. */
export interface ConvergenceRequiredRulePolicy {
  readonly mode: RequiredRuleTrustMode;
  readonly actorId?: string;
  readonly updatedAt?: string;
}

export interface SetConvergenceRequiredRulePolicyInput {
  readonly mode: RequiredRuleTrustMode;
  readonly actorId: string;
  readonly updatedAt: string;
}

/** The active repository rule produced by the latest deliberate human decision. */
export interface ConvergenceFlagDisposition {
  readonly key: string;
  readonly flag: string;
  readonly disposition: ConvergenceFlagDispositionValue;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly updatedAt: string;
}

/** Append-only bounded evidence; Clear is retained here even though no rule remains active. */
export interface ConvergenceFlagFeedbackEvent {
  readonly key: string;
  readonly flag: string;
  readonly disposition: ConvergenceFlagFeedbackAction;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly decidedAt: string;
}

export interface SetConvergenceFlagFeedbackInput {
  readonly flag: string;
  readonly disposition: ConvergenceFlagFeedbackAction;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly decidedAt: string;
}

export interface ConvergenceFeedbackSummary {
  readonly durable: boolean;
  readonly totalDeliveries: number;
  readonly contestedPickDecisions: number;
  readonly proceededWithFlagDecisions: number;
  readonly totalFlagFeedbackDecisions: number;
  readonly acceptedFlagRules: number;
  readonly dismissedFlagRules: number;
  readonly updatedAt?: string;
}

export interface ConvergenceDecisionProfile extends ConvergenceFeedbackSummary {
  readonly repoId: string;
  /** Bounded newest-first evidence, retained for future explicit calibration UI. */
  readonly decisions: readonly ConvergenceDecisionRecord[];
  /** Active exact-match rules used to calibrate future trust for this repository. */
  readonly flagDispositions: readonly ConvergenceFlagDisposition[];
  /** Bounded newest-first human decision history, including cleared rules. */
  readonly flagFeedbackHistory: readonly ConvergenceFlagFeedbackEvent[];
  /** Explicit operator setting; defaults to `off` for old/new repositories. */
  readonly requiredRulePolicy: ConvergenceRequiredRulePolicy;
}

export interface ConvergenceFeedbackPort {
  readonly durable: boolean;
  read(repoId: string): Promise<ConvergenceDecisionProfile>;
  record(repoId: string, decision: ConvergenceDecisionRecord): Promise<ConvergenceDecisionProfile>;
  setFlagDisposition(repoId: string, input: SetConvergenceFlagFeedbackInput): Promise<ConvergenceDecisionProfile>;
  setRequiredRulePolicy(repoId: string, input: SetConvergenceRequiredRulePolicyInput): Promise<ConvergenceDecisionProfile>;
}
