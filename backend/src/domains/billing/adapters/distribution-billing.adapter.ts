/**
 * `createDistributionBillingAdapter` — wraps `@recoder/distribution`'s
 * entitlement resolver so the {@link EntitlementService} reuses distribution's
 * grant algebra WITHOUT redefining it (doc §7: distribution is "the core").
 *
 * In the Phase-9 CORE no provider adapter exists yet, so this adapter is
 * degrade-safe: when no distribution `BillingPort` is injected it reports
 * `configured:false` and answers every grant query with DENY-ON-MISS (empty
 * grants / `hasFeatureGrant:false`). A provider adapter wired later (step 5)
 * supplies the `BillingPort` and grant-based lifts light up automatically — the
 * gate contract does not change.
 */
import {
  createEntitlementResolver,
  type BillingPort,
  type Entitlement,
  type EntitlementResolver,
  type Feature as DistributionFeature,
  type Plan as DistributionPlan,
  type Subject as DistributionSubject,
} from '@recoder/distribution';
import type { BillingSubject } from '../types.js';

/** The narrowed grant surface the entitlement service consumes. */
export interface DistributionBillingAdapter {
  /** True only when a distribution `BillingPort` (a real provider) is wired. */
  readonly configured: boolean;
  /** Active, non-revoked grants for a subject. Deny-on-miss ⇒ `[]` on any fault. */
  resolveGrants(subject: BillingSubject): Promise<readonly Entitlement[]>;
  /**
   * True only when the subject's plan statically carries the feature OR an
   * explicit `feature_flag` grant names it. Deny-on-miss on any fault.
   */
  hasFeatureGrant(subject: BillingSubject, feature: DistributionFeature, plan: DistributionPlan): Promise<boolean>;
}

export interface DistributionBillingAdapterDeps {
  /**
   * The distribution provider port (grant source). Absent in the CORE ⇒ the
   * adapter degrades to `configured:false` + deny-on-miss.
   */
  readonly billing?: BillingPort;
}

function toDistributionSubject(subject: BillingSubject): DistributionSubject {
  return { subjectId: subject.subjectId, kind: subject.kind };
}

export function createDistributionBillingAdapter(
  deps: DistributionBillingAdapterDeps = {},
): DistributionBillingAdapter {
  const resolver: EntitlementResolver | null = deps.billing
    ? createEntitlementResolver(deps.billing)
    : null;

  return {
    configured: resolver !== null,

    async resolveGrants(subject) {
      if (!resolver) return [];
      try {
        return await resolver.resolve(toDistributionSubject(subject));
      } catch {
        return []; // deny on miss
      }
    },

    async hasFeatureGrant(subject, feature, plan) {
      if (!resolver) return false;
      try {
        return await resolver.hasFeature(toDistributionSubject(subject), feature, plan);
      } catch {
        return false; // deny on miss
      }
    },
  };
}
