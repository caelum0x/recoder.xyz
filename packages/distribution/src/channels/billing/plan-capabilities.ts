import type { Feature, Plan } from '../../domain/subscription-plan';
import { FEATURE_MATRIX, planHasFeature } from '../../domain/subscription-plan';

/**
 * The capability profile a plan tier projects. This is the static, deny-safe
 * floor the entitlement gate consults when no finer-grained Polar benefit grant
 * is present. It is NOT the durable source of truth (that is the billing port →
 * fused Polar engine); it is the conservative default a host can reason about
 * offline and the gate falls back to.
 */
export interface PlanCapabilities {
  readonly plan: Plan;
  /** Features statically included with the tier (mirrors FEATURE_MATRIX). */
  readonly features: readonly Feature[];
  /**
   * Max active devices allowed per seat on this tier. `0` means unlimited.
   * Higher tiers get more headroom; this is the plan→device-limit link the
   * device registry enforces (see `deviceLimitForPlan`).
   */
  readonly deviceLimit: number;
  /** True when the tier is billed at the org/seat level (team, enterprise). */
  readonly seatBilled: boolean;
}

/**
 * Per-tier device limits. Conservative, fail-safe defaults. `0` = unlimited
 * (enterprise negotiates its own ceiling upstream). A host MAY override these
 * via an explicit `deviceLimit` passed to the device registry; this table is
 * the default when the host does not.
 */
const DEVICE_LIMIT: Record<Plan, number> = {
  free: 1,
  pro: 3,
  team: 10,
  enterprise: 0, // unlimited (governed by the negotiated upstream grant)
};

const SEAT_BILLED: Record<Plan, boolean> = {
  free: false,
  pro: false,
  team: true,
  enterprise: true,
};

/** The full capability profile for a plan tier. */
export function capabilitiesForPlan(plan: Plan): PlanCapabilities {
  return {
    plan,
    features: FEATURE_MATRIX[plan],
    deviceLimit: DEVICE_LIMIT[plan],
    seatBilled: SEAT_BILLED[plan],
  };
}

/**
 * The default per-seat device limit for a plan tier. `0` means unlimited.
 * This is the plan→device-limit mapping the registry uses when the host does
 * not pass an explicit limit. Unknown/undefined plans fall back to the most
 * restrictive limit (fail safe: deny extra devices on uncertainty).
 */
export function deviceLimitForPlan(plan: Plan): number {
  return DEVICE_LIMIT[plan] ?? DEVICE_LIMIT.free;
}

/**
 * The static capability check: does the plan tier include the feature? A thin,
 * named alias over the feature matrix so the gate reads as a capability query.
 */
export function planAllowsFeature(plan: Plan, feature: Feature): boolean {
  return planHasFeature(plan, feature);
}

/**
 * The effective per-seat device limit to enforce: an explicit host override
 * wins (a negotiated/admin-set ceiling), otherwise the plan tier's default.
 * `0` means unlimited. This is the single seam a caller threads into the device
 * registry's `register({ deviceLimit })` so plan→device-limit enforcement is
 * consistent across hosts.
 */
export function resolveDeviceLimit(plan: Plan, override?: number): number {
  return override !== undefined ? override : deviceLimitForPlan(plan);
}
