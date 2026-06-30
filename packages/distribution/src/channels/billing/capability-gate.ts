import type { Subject } from '../../domain/entitlement';
import type { Plan } from '../../domain/subscription-plan';
import type { SecretPort } from '../../ports/secret-port';
import { ENV_KEYS } from '../../config/index';
import {
  capabilityLimitForPlan,
  UNLIMITED,
  type PlanCapabilityKey,
} from './plan-capabilities';
import type { EntitlementResolver } from './entitlement-resolver';

/**
 * Why a capability request was denied. Truthful, evidence-style reasons a host
 * surfaces to the user — never a bare "denied".
 */
export type CapabilityDenyReason =
  | 'billing_unconfigured'
  | 'capability_not_in_plan'
  | 'over_tier_limit';

export interface CapabilityDecision {
  readonly allowed: boolean;
  readonly plan: Plan;
  readonly capability: PlanCapabilityKey;
  /** The amount requested (defaults to 1). */
  readonly requested: number;
  /** The effective per-tier ceiling (0 = none, Infinity = unlimited). */
  readonly limit: number;
  readonly reason?: CapabilityDenyReason;
  readonly message?: string;
}

export interface CapabilityGateDeps {
  readonly resolver: EntitlementResolver;
  readonly secrets: SecretPort;
}

/**
 * Billing is configured only when the load-bearing Polar token is present.
 * Absent → the provider can resolve nothing, so any PAID capacity must fail
 * safe to the free floor (AGENTS.md #5, production rule: fail safe on missing
 * keys). The free floor itself never needs a provider.
 */
function billingConfigured(secrets: SecretPort): boolean {
  return secrets.has(ENV_KEYS.POLAR_ACCESS_TOKEN);
}

/**
 * Gate a QUANTITATIVE, tier-scoped capability (parallel-agent count, remote
 * substrate, team seats) by plan tier. This complements `decideEntitlement`
 * (binary channel features) and the device-limit / quota enforcers — it is the
 * seam a host calls before allocating capacity that scales with the plan.
 *
 * Fail-safe contract (deny by default), evaluated in order:
 *  1. Resolve the effective ceiling for `capability` on `plan` — but FAIL SAFE
 *     to the FREE tier's ceiling when billing is unconfigured AND the requested
 *     amount exceeds what free allows. We never hand out paid capacity without
 *     a working provider.
 *  2. If the (fail-safe) ceiling is `0`, the capability is not in the tier →
 *     DENY (`capability_not_in_plan` / `billing_unconfigured`).
 *  3. If `requested` exceeds the ceiling → DENY (`over_tier_limit`).
 *  4. Otherwise → ALLOW. `UNLIMITED` (Infinity) always allows.
 *
 * Note: this consults the static tier floor (deny-safe) and does NOT optimistic
 * -ally trust runtime state. A host that wants a grant to lift a tier above its
 * floor passes that intent through `resolver`-backed `decideEntitlement` for the
 * binary feature, then sizes capacity here.
 */
export async function decideCapability(
  deps: CapabilityGateDeps,
  subject: Subject,
  capability: PlanCapabilityKey,
  plan: Plan,
  requested = 1,
): Promise<CapabilityDecision> {
  void subject; // reserved: per-subject grant overrides resolve via decideEntitlement
  const freeLimit = capabilityLimitForPlan('free', capability);
  const tierLimit = capabilityLimitForPlan(plan, capability);

  // 1. Fail safe: without a configured provider, a request that exceeds the
  //    FREE floor cannot be honored — clamp the effective ceiling to free.
  const configured = billingConfigured(deps.secrets);
  const effectiveLimit = configured ? tierLimit : Math.min(tierLimit, freeLimit);

  const base = {
    plan,
    capability,
    requested,
    limit: effectiveLimit,
  } as const;

  // Unlimited always allows (only reachable when configured).
  if (effectiveLimit === UNLIMITED) {
    return { ...base, allowed: true };
  }

  // 2. No headroom at all on this (fail-safe) tier.
  if (effectiveLimit <= 0) {
    // Distinguish "the tier never carries it" from "billing not configured so
    // we fell back to the free floor which is zero".
    if (!configured && tierLimit > 0) {
      return {
        ...base,
        allowed: false,
        reason: 'billing_unconfigured',
        message: `billing is not configured (${ENV_KEYS.POLAR_ACCESS_TOKEN} absent); capability '${capability}' is denied above the free tier`,
      };
    }
    return {
      ...base,
      allowed: false,
      reason: 'capability_not_in_plan',
      message: `plan '${plan}' does not grant capability '${capability}'`,
    };
  }

  // 3. Over the ceiling.
  if (requested > effectiveLimit) {
    const clamped = !configured && tierLimit > effectiveLimit;
    const clampNote = clamped
      ? ` (billing unconfigured: ${ENV_KEYS.POLAR_ACCESS_TOKEN} absent; clamped to the free-tier limit of ${effectiveLimit})`
      : '';
    return {
      ...base,
      allowed: false,
      reason: clamped ? 'billing_unconfigured' : 'over_tier_limit',
      message: `requested ${requested} for '${capability}' exceeds the limit ${effectiveLimit} on plan '${plan}'${clampNote}`,
    };
  }

  // 4. Within the ceiling.
  return { ...base, allowed: true };
}

/**
 * Convenience predicate over `decideCapability` for call sites that only need a
 * boolean. Same fail-safe contract: denies on missing billing / over-limit.
 */
export async function capabilityAllowed(
  deps: CapabilityGateDeps,
  subject: Subject,
  capability: PlanCapabilityKey,
  plan: Plan,
  requested = 1,
): Promise<boolean> {
  const d = await decideCapability(deps, subject, capability, plan, requested);
  return d.allowed;
}
