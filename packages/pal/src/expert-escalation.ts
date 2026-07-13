/**
 * Confidence ladder + expert-escalation gate ported from modules/communication/pal-mcp-server.
 *
 * Sources:
 * - tools/workflow/schema_builders.py:68 (confidence enum)
 * - tools/debug.py should_skip_expert_analysis (the "certain" local-completion gate)
 * - tools/workflow/workflow_mixin.py handle_work_completion (escalation decision)
 * - tools/models.py:361 (SPECIAL_STATUS_MODELS keys)
 */

export const CONFIDENCE_LEVELS = [
  'exploring',
  'low',
  'medium',
  'high',
  'very_high',
  'almost_certain',
  'certain',
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export function isConfidenceLevel(value: string): value is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

/** Rank in the ladder; higher means more confident. */
export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_LEVELS.indexOf(level);
}

export function isConfidenceAtLeast(level: ConfidenceLevel, threshold: ConfidenceLevel): boolean {
  return confidenceRank(level) >= confidenceRank(threshold);
}

export type EscalationInput = {
  confidence: ConfidenceLevel;
  nextStepRequired: boolean;
  /** Tool-level flag (requires_expert_analysis) — planner is false, debug/codereview true. */
  requiresExpertAnalysis: boolean;
  /** Tool decision from findings (should_call_expert_analysis); defaults true. */
  shouldCallExpertAnalysis?: boolean;
};

/**
 * Port of debug.py should_skip_expert_analysis: skip only at "certain"
 * confidence on the final step. (Base workflow default is never-skip;
 * this is the deterministic ladder gate used by escalating tools.)
 */
export function shouldSkipExpertAnalysis(
  input: Pick<EscalationInput, 'confidence' | 'nextStepRequired'>,
): boolean {
  return input.confidence === 'certain' && !input.nextStepRequired;
}

export type CompletionDecision =
  | 'high_confidence_completion'
  | 'calling_expert_analysis'
  | 'local_completion';

/**
 * Port of BaseWorkflowMixin.handle_work_completion (workflow_mixin.py:1267-1279):
 * 1. certain confidence → complete locally without a second model
 * 2. tool requires + wants expert analysis → escalate to a second model
 * 3. otherwise → complete locally
 */
export function decideCompletion(input: EscalationInput): CompletionDecision {
  if (shouldSkipExpertAnalysis(input)) {
    return 'high_confidence_completion';
  }
  if (input.requiresExpertAnalysis && (input.shouldCallExpertAnalysis ?? true)) {
    return 'calling_expert_analysis';
  }
  return 'local_completion';
}

/** tools/models.py:361 SPECIAL_STATUS_MODELS keys — statuses that interrupt normal flow. */
export const SPECIAL_STATUSES = [
  'files_required_to_continue',
  'full_codereview_required',
  'focused_review_required',
  'test_sample_needed',
  'more_tests_required',
  'refactor_analysis_complete',
  'trace_complete',
  'resend_prompt',
  'code_too_large',
  'analysis_complete',
  'no_bug_found',
] as const;

export type SpecialStatus = (typeof SPECIAL_STATUSES)[number];

export function isSpecialStatus(status: string): status is SpecialStatus {
  return (SPECIAL_STATUSES as readonly string[]).includes(status);
}
