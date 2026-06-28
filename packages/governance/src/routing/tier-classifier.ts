import type { PolicyDecisionEffect } from '@recoder/agent-os';
import type { GovernanceAction } from '../domain/governance-request';
import { maxRiskTier, type RiskTier } from '../domain/risk-tier';

/**
 * tier-classifier — fuses the action's intrinsic risk, the policy effect, and
 * the estimated complexity into a single RiskTier. This is the TS view of the
 * Rust `risk_tier_router.rs` fusion: a high-risk action on a trivial prompt
 * still routes high, and a needs_approval/deny effect raises the floor.
 *
 * The fusion is deny-biased: we take the MAX of the action-derived tier, the
 * effect-derived tier, and the complexity-derived tier. Nothing lowers risk.
 */

/** Intrinsic risk tier for an action, independent of target/complexity. */
const ACTION_BASE_TIER: Readonly<Record<GovernanceAction, RiskTier>> = {
  'file.read': 'low',
  'tool.call': 'low',
  'command.run': 'medium',
  'file.write': 'medium',
  'memory.write': 'high',
  'artifact.publish': 'high',
  'deploy.preview': 'high',
  'branch.push': 'high',
  'pr.create': 'high',
};

/** The policy effect raises the floor: needs_approval => at least high. */
function effectFloor(effect: PolicyDecisionEffect): RiskTier {
  switch (effect) {
    case 'deny':
      return 'critical';
    case 'needs_approval':
      return 'high';
    case 'allow':
    default:
      return 'low';
  }
}

/** Map a complexity score in [0,1] to a tier. */
function complexityTier(score: number): RiskTier {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

export type TierClassificationInput = {
  readonly action: GovernanceAction;
  readonly effect: PolicyDecisionEffect;
  readonly complexity: number; // [0,1]
  /** Production/sensitive environment bumps the floor to high. */
  readonly environment?: string;
};

export function classifyTier(input: TierClassificationInput): RiskTier {
  const base = ACTION_BASE_TIER[input.action] ?? 'high'; // unknown action -> high
  const floor = effectFloor(input.effect);
  const complexity = complexityTier(input.complexity);

  let tier = maxRiskTier(maxRiskTier(base, floor), complexity);

  const env = input.environment?.toLowerCase();
  if (env && (env.includes('prod') || env.includes('production'))) {
    tier = maxRiskTier(tier, 'high');
  }

  return tier;
}
