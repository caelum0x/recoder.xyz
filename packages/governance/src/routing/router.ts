import type { PolicyDecisionEffect } from '@recoder/agent-os';
import type { GovernanceRequest } from '../domain/governance-request';
import type { RiskTier } from '../domain/risk-tier';
import { type RoutingDecision, type RuntimePreference, routeTo, unroutable } from '../domain/routing-decision';
import { estimateComplexity } from './complexity-estimator';
import { classifyTier } from './tier-classifier';

/**
 * RoutingService — maps a classified RiskTier to a concrete model + runtime
 * preference + cost hint. A denied action never routes (structural guarantee).
 *
 * The tier->model/runtime maps are config-overridable; the defaults below are
 * conservative: higher tiers prefer higher-assurance models and the most
 * locked-down runtime adapter.
 */

export type TierRouteEntry = {
  readonly model: string;
  readonly runtime: RuntimePreference;
  readonly costHint: number;
};

export type RoutingCatalog = Readonly<Record<RiskTier, TierRouteEntry>>;

export const DEFAULT_ROUTING_CATALOG: RoutingCatalog = {
  low: { model: 'claude-haiku', runtime: 'generic', costHint: 0.1 },
  medium: { model: 'claude-sonnet', runtime: 'claude_code', costHint: 0.4 },
  high: { model: 'claude-opus', runtime: 'claude_code', costHint: 0.8 },
  critical: { model: 'claude-opus', runtime: 'recoder_code', costHint: 1.0 },
};

export class RoutingService {
  constructor(private readonly catalog: RoutingCatalog = DEFAULT_ROUTING_CATALOG) {}

  /**
   * Decide a route. `effect` is the fused policy effect; a `deny` yields an
   * unroutable decision regardless of tier.
   */
  route(req: GovernanceRequest, effect: PolicyDecisionEffect): RoutingDecision {
    const complexity = estimateComplexity(req).total;
    const tier = classifyTier({
      action: req.action,
      effect,
      complexity,
      environment: req.target.environment,
    });

    if (effect === 'deny') {
      return unroutable(tier, 'Action denied by policy; no route offered.');
    }

    const entry = this.catalog[tier];
    return routeTo({
      tier,
      model: entry.model,
      runtime: entry.runtime,
      costHint: entry.costHint,
      reason:
        effect === 'needs_approval'
          ? `Routed at tier '${tier}' pending approval (complexity ${complexity.toFixed(2)}).`
          : `Routed at tier '${tier}' (complexity ${complexity.toFixed(2)}).`,
    });
  }
}
