import type { Subject } from '../../domain/entitlement';
import type { Feature, Plan } from '../../domain/subscription-plan';
import type { SecretPort } from '../../ports/secret-port';
import { ENV_KEYS } from '../../config/index';
import { capabilitiesForPlan, deviceLimitForPlan } from './plan-capabilities';
import type { EntitlementResolver } from './entitlement-resolver';

/**
 * Why an entitlement decision came out the way it did. Truthful, evidence-style
 * reasons — never a generic "denied". A host surfaces these to the user.
 */
export type EntitlementDenyReason =
  | 'billing_unconfigured'
  | 'feature_not_in_plan'
  | 'no_grant';

export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly plan: Plan;
  readonly feature: Feature;
  /** The per-seat device limit this plan tier grants (0 = unlimited). */
  readonly deviceLimit: number;
  readonly reason?: EntitlementDenyReason;
  readonly message?: string;
}

export interface DecideEntitlementDeps {
  readonly resolver: EntitlementResolver;
  readonly secrets: SecretPort;
}

/**
 * Is billing configured? The Polar access token is the load-bearing secret —
 * absent → the provider can resolve nothing, so we MUST fail safe (AGENTS.md
 * #5). The ONLY exception is a feature the FREE tier statically includes: those
 * never require a paid grant, so the gate can answer them offline without the
 * provider (otherwise an unconfigured host could not even run the free tier).
 */
function billingConfigured(secrets: SecretPort): boolean {
  return secrets.has(ENV_KEYS.POLAR_ACCESS_TOKEN);
}

/**
 * The end-to-end entitlement gate: plan tier → capability check → grant check,
 * with a strict fail-safe contract.
 *
 * Order of evaluation (deny by default):
 *  1. If the FREE tier statically includes the feature → ALLOW (no paid grant
 *     needed; works even when billing is unconfigured).
 *  2. If billing is NOT configured → DENY (`billing_unconfigured`). We never
 *     optimistically allow a paid capability without a working provider.
 *  3. If the actor's plan tier statically includes the feature OR an explicit
 *     feature_flag grant names it (resolved via the billing port) → ALLOW.
 *  4. Otherwise → DENY, distinguishing "the plan never carries this feature"
 *     (`feature_not_in_plan`) from "the plan could, but no active grant backs
 *     it" (`no_grant`).
 *
 * The returned `deviceLimit` is the plan tier's per-seat device ceiling, ready
 * to thread into the device registry's limit enforcement.
 */
export async function decideEntitlement(
  deps: DecideEntitlementDeps,
  subject: Subject,
  feature: Feature,
  plan: Plan,
): Promise<EntitlementDecision> {
  const deviceLimit = deviceLimitForPlan(plan);
  const base = { plan, feature, deviceLimit } as const;

  // 1. Free-tier features are always available — no provider required.
  if (capabilitiesForPlan('free').features.includes(feature)) {
    return { ...base, allowed: true };
  }

  // 2. Any paid capability requires a configured provider. Deny otherwise.
  if (!billingConfigured(deps.secrets)) {
    return {
      ...base,
      allowed: false,
      reason: 'billing_unconfigured',
      message: `billing is not configured (${ENV_KEYS.POLAR_ACCESS_TOKEN} absent); paid feature '${feature}' is denied`,
    };
  }

  // 3. Plan tier statically includes it, OR a feature_flag grant names it.
  let allowed = false;
  try {
    allowed = await deps.resolver.hasFeature(subject, feature, plan);
  } catch {
    allowed = false; // deny on miss
  }
  if (allowed) {
    return { ...base, allowed: true };
  }

  // 4. Distinguish "tier never carries it" from "no active grant".
  const tierCarries = capabilitiesForPlan(plan).features.includes(feature);
  return {
    ...base,
    allowed: false,
    reason: tierCarries ? 'no_grant' : 'feature_not_in_plan',
    message: tierCarries
      ? `plan '${plan}' can carry '${feature}' but no active grant backs it`
      : `plan '${plan}' does not include feature '${feature}'`,
  };
}
