/**
 * `createPlanCatalog` — the tier catalog + plan→capability matrix + plan→product
 * map, widened over `@recoder/distribution`'s 4-tier algebra with the `max` tier
 * and the token/engine quota rows (doc §7 / §12).
 *
 * This is the static, DENY-SAFE floor the {@link EntitlementGate} consults when
 * no finer-grained provider grant is present — NOT the durable source of truth
 * (that is a webhook-confirmed subscription). Distribution's `FEATURE_MATRIX`
 * seeds the shared tiers; `max` is defined explicitly. `toDistributionPlan` maps
 * a `PlanTier` back onto distribution's `Plan` so grant-based resolution reuses
 * the distribution resolver without redefining its algebra.
 */
import { FEATURE_MATRIX, type Plan as DistributionPlan } from '@recoder/distribution';
import type { BillingConfig } from '../config.js';
import type { BillingProviderName, Feature, PlanTier, UsageKind } from '../types.js';

/** Tier ordering: a higher rank satisfies any lower-rank requirement. */
const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  team: 2,
  max: 3,
  enterprise: 4,
};

/**
 * The plan→capability matrix. The four shared tiers reuse distribution's
 * `FEATURE_MATRIX` verbatim; `max` = the `team` feature set (individual power
 * tier — carries every paid channel feature but not the org/enterprise-only
 * `desktop_signed_build`). Enterprise adds the signed-build capability.
 */
export const PLAN_CAPABILITIES: Record<PlanTier, readonly Feature[]> = {
  free: FEATURE_MATRIX.free,
  pro: FEATURE_MATRIX.pro,
  team: FEATURE_MATRIX.team,
  max: FEATURE_MATRIX.team,
  enterprise: FEATURE_MATRIX.enterprise,
};

/**
 * Per-tier quota limits (window = the billing period). `0` (or an absent kind)
 * means UNLIMITED — no metering. These are the token/engine capability rows the
 * doc says the catalog widens distribution with. Conservative, fail-safe floor.
 */
export const PLAN_QUOTAS: Record<PlanTier, Partial<Record<UsageKind, number>>> = {
  free: { cli_request: 200, agent_run: 50, token: 100_000, publish: 3, preview: 20, download: 20 },
  pro: { cli_request: 5_000, agent_run: 2_000, token: 5_000_000, publish: 100, preview: 500 },
  team: { cli_request: 20_000, agent_run: 10_000, token: 25_000_000 },
  max: { cli_request: 100_000, agent_run: 50_000, token: 100_000_000 },
  enterprise: {}, // unlimited (negotiated upstream)
};

export interface PlanCatalog {
  /** All tiers, lowest→highest. */
  tiers(): readonly PlanTier[];
  /** Coerce an arbitrary plan string to a known tier; unknown ⇒ `free` (floor). */
  normalize(plan: string | null | undefined): PlanTier;
  /** True when `have` is at least as privileged as `need`. */
  satisfies(have: PlanTier, need: PlanTier): boolean;
  /** The static features a tier carries (deny-safe floor). */
  capabilities(plan: PlanTier): readonly Feature[];
  /** Does the tier statically include the feature? */
  hasFeature(plan: PlanTier, feature: Feature): boolean;
  /** The quota limit for a kind on a tier; `0` = unlimited. */
  quotaLimit(plan: PlanTier, kind: UsageKind): number;
  /** Map a domain tier onto distribution's 4-tier `Plan` (grant-resolution reuse). */
  toDistributionPlan(plan: PlanTier): DistributionPlan;
  /** Resolve the active-provider product id for a tier (checkout), or undefined. */
  productForPlan(plan: PlanTier, provider?: BillingProviderName): string | undefined;
  /** Reverse map: which tier is a provider product id for (webhook reconcile)? */
  planForProduct(productId: string, provider?: BillingProviderName): PlanTier | undefined;
}

/** `max` has no distribution equivalent; it maps to `team` for grant resolution. */
const TO_DISTRIBUTION: Record<PlanTier, DistributionPlan> = {
  free: 'free',
  pro: 'pro',
  team: 'team',
  max: 'team',
  enterprise: 'enterprise',
};

const KNOWN_TIERS = new Set<string>(['free', 'pro', 'team', 'max', 'enterprise']);

export function createPlanCatalog(config: BillingConfig): PlanCatalog {
  const activeProvider = config.provider;

  function productMap(provider: BillingProviderName): Partial<Record<PlanTier, string>> {
    return (config.planProducts[provider] ?? {}) as Partial<Record<PlanTier, string>>;
  }

  return {
    tiers: () => ['free', 'pro', 'team', 'max', 'enterprise'],

    normalize(plan) {
      const p = (plan ?? '').toLowerCase().trim();
      return KNOWN_TIERS.has(p) ? (p as PlanTier) : 'free';
    },

    satisfies: (have, need) => PLAN_RANK[have] >= PLAN_RANK[need],

    capabilities: (plan) => PLAN_CAPABILITIES[plan] ?? PLAN_CAPABILITIES.free,

    hasFeature: (plan, feature) => (PLAN_CAPABILITIES[plan] ?? PLAN_CAPABILITIES.free).includes(feature),

    quotaLimit: (plan, kind) => PLAN_QUOTAS[plan]?.[kind] ?? 0,

    toDistributionPlan: (plan) => TO_DISTRIBUTION[plan] ?? 'free',

    productForPlan: (plan, provider = activeProvider) => productMap(provider)[plan],

    planForProduct(productId, provider = activeProvider) {
      const map = productMap(provider);
      for (const tier of ['enterprise', 'max', 'team', 'pro', 'free'] as PlanTier[]) {
        if (map[tier] === productId) return tier;
      }
      return undefined;
    },
  };
}
