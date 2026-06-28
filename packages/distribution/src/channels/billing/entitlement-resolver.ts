import type { Entitlement, Subject } from '../../domain/entitlement';
import type { Feature, Plan } from '../../domain/subscription-plan';
import { planHasFeature, planSatisfies } from '../../domain/subscription-plan';
import type { BillingPort } from '../../ports/billing-port';

/**
 * Resolve effective entitlements and answer feature checks with a strict
 * DENY-ON-MISS fail-safe contract: if the billing port errors, returns no
 * grants, or the grant set does not cover the feature, the answer is DENY.
 * It never optimistically allows on uncertainty.
 */
export interface EntitlementResolver {
  resolve(subject: Subject): Promise<Entitlement[]>;
  /** True only when a present grant or the subject's plan covers the feature. */
  hasFeature(subject: Subject, feature: Feature, plan: Plan): Promise<boolean>;
  /** True only when the subject's plan satisfies `requiredPlan`. */
  meetsPlan(plan: Plan, requiredPlan: Plan): boolean;
}

export function createEntitlementResolver(billing: BillingPort): EntitlementResolver {
  return {
    async resolve(subject) {
      try {
        const grants = await billing.resolveEntitlements(subject);
        // Defensive: only keep actually-granted entitlements (deny on miss).
        return grants.filter((g) => g.granted);
      } catch {
        // Fail safe: resolution failure denies — return no grants.
        return [];
      }
    },

    async hasFeature(subject, feature, plan) {
      // A feature is allowed if EITHER an explicit feature_flag grant names it
      // OR the subject's authoritative plan statically includes it.
      if (planHasFeature(plan, feature)) return true;
      try {
        const grants = await billing.resolveEntitlements(subject);
        return grants.some(
          (g) => g.granted && g.kind === 'feature_flag' && g.key === feature,
        );
      } catch {
        return false; // deny on miss
      }
    },

    meetsPlan(plan, requiredPlan) {
      return planSatisfies(plan, requiredPlan);
    },
  };
}
