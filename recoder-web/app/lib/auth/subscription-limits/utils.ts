/**
 * Subscription Limits Utilities
 * Helper functions for subscription limit management
 */

import {
  PLAN_TYPES,
  type PlanType,
  type PlanLimits,
  type PlanDetails,
  type SubscriptionLimitRecord,
} from './types';
import { addMonths } from 'date-fns';

/**
 * Get the latest active limit record (sorted by periodEnd)
 */
export function getLatestActiveLimit(
  limits: SubscriptionLimitRecord[],
  planType: 'free' | 'paid'
): SubscriptionLimitRecord | null {
  const filtered = limits.filter((limit) => {
    if (planType === 'free') {
      return limit.planName === PLAN_TYPES.FREE;
    }
    return limit.planName !== PLAN_TYPES.FREE;
  });

  if (filtered.length === 0) return null;

  // Sort by periodEnd descending, take the latest
  return (
    filtered.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0] || null
  );
}

/**
 * Create plan details object
 */
export function createPlanDetails(
  limit: SubscriptionLimitRecord,
  planLimits: PlanLimits,
  source: 'DB' | 'CONST'
): PlanDetails {
  return {
    aiNums: limit.aiNums,
    aiNumsLimit: planLimits.aiNums,
    seats: limit.seats,
    seatsLimit: planLimits.seats,
    projectNums: limit.projectNums,
    projectNumsLimit: planLimits.projectNums,
    plan: limit.planName,
    periodEnd: limit.periodEnd,
    source,
  };
}

/**
 * Create default usage return value
 */
export function createDefaultUsage(
  freeDetails: PlanDetails | null = null,
  paidDetails: PlanDetails | null = null
) {
  return {
    aiNums: 0,
    aiNumsLimit: 0,
    seats: 0,
    seatsLimit: 0,
    projectNums: 0,
    projectNumsLimit: 0,
    plan: PLAN_TYPES.FREE,
    planDetails: {
      free: freeDetails,
      paid: paidDetails,
    },
  };
}

/**
 * Check if subscription period has expired
 */
export function isPeriodExpired(periodEnd: string | Date, now: Date = new Date()): boolean {
  const periodEndDate = new Date(periodEnd);
  return now.getTime() > periodEndDate.getTime();
}

/**
 * Calculate next billing period for FREE plan
 */
export function calculateNextFreePeriod(
  currentPeriodStart: string | Date,
  now: Date = new Date()
): { periodStart: Date; periodEnd: Date } {
  let newPeriodStart = new Date(currentPeriodStart);

  // Advance period start until it covers current time
  while (addMonths(newPeriodStart, 1).getTime() <= now.getTime()) {
    newPeriodStart = addMonths(newPeriodStart, 1);
  }

  // Align to UTC midnight to prevent time drift
  newPeriodStart = new Date(
    Date.UTC(
      newPeriodStart.getUTCFullYear(),
      newPeriodStart.getUTCMonth(),
      newPeriodStart.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const periodEnd = addMonths(newPeriodStart, 1);

  return { periodStart: newPeriodStart, periodEnd };
}

/**
 * Check if annual subscription needs monthly quota refresh
 */
export function shouldRefreshAnnualQuota(lastQuotaRefresh: string | null | undefined, now: Date): boolean {
  if (!lastQuotaRefresh) {
    return true;
  }

  const lastRefresh = new Date(lastQuotaRefresh);
  const nextRefreshTime = addMonths(lastRefresh, 1);

  return now >= nextRefreshTime;
}

/**
 * Resolve quota limit with fallback rules
 */
export function resolveQuotaLimit(
  limits: PlanLimits,
  quotaType: 'aiNums' | 'enhanceNums' | 'uploadLimit' | 'deployLimit' | 'projectNums',
  fallbackValue?: number
): number {
  switch (quotaType) {
    case 'aiNums':
      return limits.aiNums || 0;
    case 'enhanceNums':
      return limits.aiNums || 0; // enhanceNums uses aiNums as source
    case 'uploadLimit':
      return limits.uploadLimit ?? limits.aiNums ?? 0;
    case 'deployLimit':
      return limits.deployLimit ?? (limits.aiNums ? limits.aiNums * 2 : 0);
    case 'projectNums':
      return limits.projectNums ?? fallbackValue ?? 0;
    default:
      return 0;
  }
}

/**
 * Parse billing interval from period duration
 */
export function parseBillingInterval(
  periodStart: Date | string,
  periodEnd: Date | string
): 'month' | 'year' {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const durationMs = end.getTime() - start.getTime();
  const monthsInPeriod = Math.floor(durationMs / (1000 * 60 * 60 * 24 * 30.44)); // Average days per month

  return monthsInPeriod >= 11 ? 'year' : 'month';
}

/**
 * Format quota display (e.g., "5 / 100")
 */
export function formatQuota(current: number, limit: number): string {
  return `${current} / ${limit}`;
}

/**
 * Calculate quota percentage used
 */
export function calculateQuotaPercentage(current: number, limit: number): number {
  if (limit <= 0) return 0;
  const used = limit - current; // current is remaining quota
  return Math.min(100, Math.round((used / limit) * 100));
}

/**
 * Check if quota is exhausted
 */
export function isQuotaExhausted(remaining: number): boolean {
  return remaining <= 0;
}

/**
 * Check if quota is low (less than 20% remaining)
 */
export function isQuotaLow(remaining: number, limit: number, threshold: number = 0.2): boolean {
  if (limit <= 0) return false;
  return remaining / limit <= threshold;
}

/**
 * Get days remaining in billing period
 */
export function getDaysRemainingInPeriod(periodEnd: string | Date): number {
  const end = new Date(periodEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format period end date for display
 */
export function formatPeriodEnd(periodEnd: string | Date): string {
  const date = new Date(periodEnd);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
