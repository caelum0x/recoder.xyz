import { z } from 'zod';

/**
 * Recoder subscription plans. These mirror `RecoderUser.subscription_plan` in
 * packages/recoder-code/.../RecoderAuthService.ts so a CLI token and a billing
 * entitlement speak the same vocabulary.
 */
export type Plan = 'free' | 'pro' | 'enterprise';

export const PlanSchema = z.enum(['free', 'pro', 'enterprise']);

export const PLANS: readonly Plan[] = ['free', 'pro', 'enterprise'] as const;

/**
 * Plan ordering for entitlement gates: a higher rank satisfies any requirement
 * a lower rank would. `enterprise >= pro >= free`.
 */
const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, enterprise: 2 };

/** True when `have` is at least as privileged as `need`. */
export function planSatisfies(have: Plan, need: Plan): boolean {
  return PLAN_RANK[have] >= PLAN_RANK[need];
}

/**
 * The distribution-relevant feature matrix. This is the gate the
 * entitlement-gate consults when no fine-grained benefit grant is present —
 * a deny-by-default floor, not the source of truth (that is the billing port).
 */
export type Feature =
  | 'cli_basic'
  | 'cli_byok'
  | 'publish_site'
  | 'custom_domain'
  | 'signed_preview'
  | 'priority_release_channel'
  | 'desktop_signed_build'
  | 'usage_metering';

export const FEATURE_MATRIX: Record<Plan, readonly Feature[]> = {
  free: ['cli_basic', 'cli_byok', 'signed_preview'],
  pro: [
    'cli_basic',
    'cli_byok',
    'signed_preview',
    'publish_site',
    'custom_domain',
    'usage_metering',
  ],
  enterprise: [
    'cli_basic',
    'cli_byok',
    'signed_preview',
    'publish_site',
    'custom_domain',
    'usage_metering',
    'priority_release_channel',
    'desktop_signed_build',
  ],
} as const;

/** Does the plan's static matrix include the feature? */
export function planHasFeature(plan: Plan, feature: Feature): boolean {
  return FEATURE_MATRIX[plan].includes(feature);
}
