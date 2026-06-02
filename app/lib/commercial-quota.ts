import { randomUUID } from 'node:crypto';

import { getCommercialEntitlements, isUnlimitedCommercialLimit, normalizeCommercialPlan } from '@/lib/plan-entitlements';
import { prisma } from '@/lib/prisma';
import type { PlanId, PlanLimits } from '@/lib/pricing-config';

type QuotaPeriod = 'day' | 'month';

interface CommercialQuotaConfig {
  plan: PlanId;
  entitlements: PlanLimits;
  sessionsPerDay: number;
  tokensPerSession: number;
  requestsLimit: number;
  isUnlimited: boolean;
}

const LEGACY_REQUEST_LIMITS: Record<PlanId, number> = {
  free: 1000,
  weekly: 5000,
  monthly: 10000,
  pro: 50000,
  enterprise: 500000,
};

export function getCommercialQuotaConfig(plan: string | null | undefined): CommercialQuotaConfig {
  const normalizedPlan = normalizeCommercialPlan(plan);
  const entitlements = getCommercialEntitlements(normalizedPlan);
  const isUnlimited = isUnlimitedCommercialLimit(entitlements.workspaces);

  return {
    plan: normalizedPlan,
    entitlements,
    sessionsPerDay: entitlements.sessionsPerDay,
    tokensPerSession: entitlements.tokensPerSessionPricey,
    requestsLimit: LEGACY_REQUEST_LIMITS[normalizedPlan],
    isUnlimited,
  };
}

export function getQuotaPeriodBounds(now = new Date(), period: QuotaPeriod = 'day') {
  const periodEnd = new Date(now);
  if (period === 'day') {
    periodEnd.setHours(23, 59, 59, 999);
  } else {
    periodEnd.setDate(periodEnd.getDate() + 30);
  }

  return {
    periodStart: now,
    periodEnd,
  };
}

function quotaLimitData(config: CommercialQuotaConfig) {
  return {
    sessionsPerDay: config.sessionsPerDay,
    tokensPerSession: config.tokensPerSession,
    requestsLimit: config.requestsLimit,
  };
}

export function buildCommercialQuotaCreateData(
  userId: string,
  plan: string | null | undefined,
  period: QuotaPeriod = 'day',
) {
  const config = getCommercialQuotaConfig(plan);
  const now = new Date();
  const { periodStart, periodEnd } = getQuotaPeriodBounds(now, period);

  return {
    id: randomUUID(),
    userId,
    ...quotaLimitData(config),
    sessionsUsedToday: 0,
    requestsUsed: 0,
    periodStart,
    periodEnd,
    lastResetAt: now,
    updatedAt: now,
  };
}

export async function ensureCommercialQuota(
  userId: string,
  plan: string | null | undefined,
  period: QuotaPeriod = 'day',
) {
  const config = getCommercialQuotaConfig(plan);
  const now = new Date();
  const existing = await prisma.user_quota.findUnique({
    where: { userId },
  });

  if (!existing) {
    return prisma.user_quota.create({
      data: buildCommercialQuotaCreateData(userId, config.plan, period),
    });
  }

  const limitData = quotaLimitData(config);
  const limitsChanged =
    existing.sessionsPerDay !== limitData.sessionsPerDay ||
    existing.tokensPerSession !== limitData.tokensPerSession ||
    existing.requestsLimit !== limitData.requestsLimit;

  if (now > existing.periodEnd) {
    const { periodStart, periodEnd } = getQuotaPeriodBounds(now, period);
    return prisma.user_quota.update({
      where: { id: existing.id },
      data: {
        ...limitData,
        sessionsUsedToday: 0,
        requestsUsed: 0,
        periodStart,
        periodEnd,
        lastResetAt: now,
        updatedAt: now,
      },
    });
  }

  if (limitsChanged) {
    return prisma.user_quota.update({
      where: { id: existing.id },
      data: {
        ...limitData,
        updatedAt: now,
      },
    });
  }

  return existing;
}

export function formatCommercialQuotaResponse(
  quota: {
    sessionsPerDay: number;
    sessionsUsedToday: number;
    tokensPerSession: number;
    requestsLimit: number;
    requestsUsed: number;
    periodStart: Date;
    periodEnd: Date;
    lastResetAt: Date;
  },
  plan: string | null | undefined,
) {
  const config = getCommercialQuotaConfig(plan);
  const sessionsRemaining = config.isUnlimited
    ? config.sessionsPerDay
    : Math.max(0, quota.sessionsPerDay - quota.sessionsUsedToday);

  return {
    legacy: {
      sessionsPerDay: quota.sessionsPerDay,
      sessionsUsedToday: quota.sessionsUsedToday,
      sessionsRemaining,
      tokensPerSession: quota.tokensPerSession,
      requestsLimit: quota.requestsLimit,
      requestsUsed: quota.requestsUsed,
      remaining: sessionsRemaining,
      limit: quota.sessionsPerDay,
      periodStart: quota.periodStart,
      periodEnd: quota.periodEnd,
      lastResetAt: quota.lastResetAt,
      isUnlimited: config.isUnlimited,
    },
    commercial: {
      plan: config.plan,
      entitlements: config.entitlements,
      activationMilestone: 'connect-agent',
    },
    canMakeRequest: config.isUnlimited || sessionsRemaining > 0,
  };
}
