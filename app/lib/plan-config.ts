/**
 * Compatibility layer for older usage/session code.
 *
 * Pricing and commercial limits live in pricing-config. Keep this module thin
 * so legacy callers cannot drift back to a separate plan model.
 */

import {
  FREE_MODELS,
  PLANS,
  PRICEY_MODELS,
  canUseTokens,
  getPlanLimits as getPricingPlanLimits,
  isPriceyModel,
  type PlanId,
  type PlanLimits as CommercialPlanLimits,
} from './pricing-config';
import { normalizeCommercialPlan } from './plan-entitlements';

export type PlanType = PlanId;

export interface PlanLimits extends CommercialPlanLimits {
  requiresOwnApiKey: boolean;
  features: string[];
  premiumModels: boolean;
  premiumModelsTokenLimit: number;
  monthlyRequests: number;
  tokensPerMonth: number;
}

export const PREMIUM_MODELS = PRICEY_MODELS;

const LEGACY_MONTHLY_REQUESTS: Record<PlanId, number> = {
  free: 1000,
  weekly: 5000,
  monthly: 10000,
  pro: 50000,
  enterprise: -1,
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = Object.fromEntries(
  (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const plan = PLANS[planId];
    const limits = plan.limits;

    return [
      planId,
      {
        ...limits,
        requiresOwnApiKey: plan.features.requiresApiKey,
        features: plan.features.features,
        premiumModels: true,
        premiumModelsTokenLimit: limits.tokensPerSessionPricey,
        monthlyRequests: LEGACY_MONTHLY_REQUESTS[planId],
        tokensPerMonth:
          planId === 'enterprise'
            ? -1
            : limits.tokensPerSessionPricey * Math.max(1, limits.sessionsPerDay) * 30,
      },
    ];
  }),
) as Record<PlanId, PlanLimits>;

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizeCommercialPlan(plan)];
}

export function hasFeature(plan: string | null | undefined, feature: string): boolean {
  const limits = getPlanLimits(plan);
  return limits.features.includes(feature) || limits.features.includes('everything');
}

export function isPremiumModel(model: string): boolean {
  return isPriceyModel(model);
}

export function canStartSession(
  plan: string | null | undefined,
  sessionsToday: number,
): {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
} {
  const normalizedPlan = normalizeCommercialPlan(plan);
  const limits = getPricingPlanLimits(normalizedPlan);

  if (limits.sessionsPerDay >= 999 || sessionsToday < limits.sessionsPerDay) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Legacy daily runtime limit of ${limits.sessionsPerDay} reached. Upgrade for more Spaces, connected agents, approvals, retention, and preview capacity.`,
    upgradeRequired: normalizedPlan === 'free',
  };
}

export function canUseModel(
  plan: string | null | undefined,
  model: string,
  tokensUsedToday: number,
): {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
} {
  const normalizedPlan = normalizeCommercialPlan(plan);
  const limits = getPricingPlanLimits(normalizedPlan);
  const check = canUseTokens(normalizedPlan, tokensUsedToday, 0, model);

  if (!check.allowed) {
    return {
      allowed: false,
      reason: check.reason,
      upgradeRequired: normalizedPlan === 'free',
    };
  }

  if (isPriceyModel(model) && limits.tokensPerSessionPricey < 999999 && tokensUsedToday >= limits.tokensPerSessionPricey) {
    return {
      allowed: false,
      reason: `Legacy pricey-model runtime budget of ${limits.tokensPerSessionPricey} tokens reached. Free/BYOK models remain available.`,
      upgradeRequired: false,
    };
  }

  return { allowed: true };
}

export const PLAN_PRICING = Object.fromEntries(
  (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const plan = PLANS[planId];
    return [
      planId,
      {
        monthly: plan.period === 'month' ? plan.price : 0,
        yearly: plan.period === 'month' ? plan.price * 10 : 0,
        currency: 'USD',
        billingCycle: plan.period,
        custom: planId === 'enterprise',
        features: plan.features.features,
      },
    ];
  }),
);

export { FREE_MODELS };

export default {
  PLAN_LIMITS,
  PLAN_PRICING,
  PREMIUM_MODELS,
  FREE_MODELS,
  getPlanLimits,
  hasFeature,
  isPremiumModel,
  canStartSession,
  canUseModel,
};
