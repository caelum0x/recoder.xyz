import type { RiskTier } from './risk-tier';

/**
 * RoutingDecision — the TS view of the Rust `risk_tier_router.rs` output. It
 * fuses estimated complexity with policy risk to pick a tier, then maps that
 * tier to a model + runtime preference and a cost hint.
 *
 * A denied action never routes: `routable` is false and `model`/`runtime` are
 * undefined. This is the structural guarantee that a deny cannot be downgraded
 * into a quietly-served request.
 */
export type RuntimePreference = 'claude_code' | 'codex' | 'recoder_code' | 'generic';

export type RoutingDecision = {
  readonly tier: RiskTier;
  /** False when the underlying action was denied; no route is offered. */
  readonly routable: boolean;
  readonly model?: string;
  readonly runtime?: RuntimePreference;
  /** Relative cost hint (0..1) for budget gating; higher = pricier tier. */
  readonly costHint: number;
  readonly reason: string;
};

export function unroutable(tier: RiskTier, reason: string): RoutingDecision {
  return {
    tier,
    routable: false,
    costHint: 0,
    reason,
  };
}

export function routeTo(input: {
  tier: RiskTier;
  model: string;
  runtime: RuntimePreference;
  costHint: number;
  reason: string;
}): RoutingDecision {
  return {
    tier: input.tier,
    routable: true,
    model: input.model,
    runtime: input.runtime,
    costHint: input.costHint,
    reason: input.reason,
  };
}
