import { PLANS, type PlanId, type PlanLimits } from '@/lib/pricing-config';

export function normalizeCommercialPlan(plan: string | null | undefined): PlanId {
  const value = String(plan || '').trim().toLowerCase();

  if (value === 'weekly' || value === 'monthly' || value === 'pro' || value === 'enterprise' || value === 'free') {
    return value as PlanId;
  }
  if (value.includes('enterprise')) return 'enterprise';
  if (value.includes('business')) return 'pro';
  if (value.includes('pro-yearly') || value.includes('pro-monthly') || value.includes('professional')) return 'monthly';
  if (value.includes('weekly')) return 'weekly';
  if (value.includes('monthly')) return 'monthly';
  return 'free';
}

export function getCommercialEntitlements(plan: string | null | undefined): PlanLimits {
  return PLANS[normalizeCommercialPlan(plan)].limits;
}

export function isUnlimitedCommercialLimit(value: number): boolean {
  return value >= 999;
}

