import { type RiskTier, riskTierGt } from '../domain/risk-tier';

/**
 * auto-approver — honors an autonomous-mode auto-approval but caps it at a
 * configurable tier ceiling. The blueprint's hard rule: never auto-approve
 * `critical`. The ceiling defaults to `medium`, so by default only low/medium
 * tiers can be auto-approved, and only when the run is explicitly autonomous.
 *
 * This is the fail-safe seam: if the ceiling is mis-set above the intended
 * value, the tier classification still gates the action, but the auto-approver
 * itself refuses anything strictly above the ceiling.
 */

export type AutoApproverConfig = {
  /** Whether auto-approval is enabled at all. */
  readonly enabled: boolean;
  /** Highest tier that may be auto-approved. Hard-capped below `critical`. */
  readonly ceiling: RiskTier;
};

export const DEFAULT_AUTO_APPROVER_CONFIG: AutoApproverConfig = {
  enabled: false,
  ceiling: 'medium',
};

export class AutoApprover {
  private readonly ceiling: RiskTier;
  private readonly enabled: boolean;

  constructor(config: AutoApproverConfig = DEFAULT_AUTO_APPROVER_CONFIG) {
    this.enabled = config.enabled;
    // Hard safety clamp: the ceiling can never be 'critical', no matter what
    // config asks. Critical actions always require a human.
    this.ceiling = config.ceiling === 'critical' ? 'high' : config.ceiling;
  }

  /**
   * Decide whether an action at `tier` may be auto-approved given the run's
   * autonomy. Returns true ONLY when:
   *   - auto-approval is enabled, AND
   *   - the run is autonomous, AND
   *   - the tier is at or below the (clamped) ceiling, AND
   *   - the tier is never 'critical'.
   */
  canAutoApprove(tier: RiskTier, autonomous: boolean): boolean {
    if (!this.enabled) return false;
    if (!autonomous) return false;
    if (tier === 'critical') return false;
    return !riskTierGt(tier, this.ceiling);
  }

  effectiveCeiling(): RiskTier {
    return this.ceiling;
  }
}
