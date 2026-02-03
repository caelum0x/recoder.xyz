/**
 * Subscription Limits Constants
 * Default plan limits and configuration
 */

import { PLAN_TYPES, type PlanType, type PlanLimits } from './types';
import { getAuthEnv } from '../env';

/**
 * Default plan limits (fallback when DB is unavailable)
 */
export const DEFAULT_PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PLAN_TYPES.FREE]: {
    aiNums: 5,
    seats: 1,
    projectNums: 1,
    uploadLimit: 5,
    deployLimit: 10,
  },
  [PLAN_TYPES.PRO]: {
    aiNums: 100,
    seats: 3,
    projectNums: 10,
    uploadLimit: 100,
    deployLimit: 200,
  },
  [PLAN_TYPES.MAX]: {
    aiNums: 500,
    seats: 10,
    projectNums: 50,
    uploadLimit: 500,
    deployLimit: 1000,
  },
};

/**
 * Plan limits cache
 */
const planLimitsCache = new Map<string, { limits: PlanLimits; source: 'DB' | 'CONST'; cachedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get plan limits from database or cache
 */
export async function getPlanLimits(
  planType: PlanType
): Promise<{ limits: PlanLimits; source: 'DB' | 'CONST' }> {
  // Check cache first
  const cached = planLimitsCache.get(planType);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { limits: cached.limits, source: cached.source };
  }

  // Try to fetch from main site API
  try {
    const env = getAuthEnv();
    const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

    const response = await fetch(`${mainSiteUrl}/api/plans/${encodeURIComponent(planType)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { limits?: PlanLimits };
      if (data.limits) {
        const result = { limits: data.limits, source: 'DB' as const };
        planLimitsCache.set(planType, { ...result, cachedAt: Date.now() });
        return result;
      }
    }
  } catch (error) {
    console.error(`[PlanLimits] Failed to fetch plan limits for ${planType}:`, error);
  }

  // Fallback to default constants
  const defaultLimits = DEFAULT_PLAN_LIMITS[planType];
  if (defaultLimits) {
    const result = { limits: defaultLimits, source: 'CONST' as const };
    planLimitsCache.set(planType, { ...result, cachedAt: Date.now() });
    return result;
  }

  // If plan type is not recognized, return FREE plan limits
  console.warn(`[PlanLimits] Unknown plan type: ${planType}, using FREE plan defaults`);
  return { limits: DEFAULT_PLAN_LIMITS[PLAN_TYPES.FREE], source: 'CONST' };
}

/**
 * Get all plan limits
 */
export async function getAllPlanLimits(): Promise<
  Record<PlanType, { limits: PlanLimits; source: 'DB' | 'CONST' }>
> {
  const results = await Promise.all(
    Object.values(PLAN_TYPES).map(async (planType) => {
      const result = await getPlanLimits(planType);
      return [planType, result] as const;
    })
  );

  return Object.fromEntries(results) as Record<PlanType, { limits: PlanLimits; source: 'DB' | 'CONST' }>;
}

/**
 * Clear plan limits cache
 */
export function clearPlanLimitsCache(): void {
  planLimitsCache.clear();
}

/**
 * Parse plan limits from JSON string
 */
export function parsePlanLimits(limitsJson: string): PlanLimits | null {
  try {
    const parsed = JSON.parse(limitsJson);

    return {
      aiNums: parseInt(parsed.ai_nums ?? '0', 10),
      seats: parseInt(parsed.seats ?? '1', 10),
      projectNums: parseInt(parsed.project_nums ?? '1', 10),
      uploadLimit: parseInt(parsed.upload_limit ?? parsed.ai_nums ?? '0', 10),
      deployLimit: parseInt(parsed.deploy_limit ?? String((parsed.ai_nums ?? 0) * 2), 10),
    };
  } catch (error) {
    console.warn('[PlanLimits] Failed to parse plan limits JSON:', limitsJson, error);
    return null;
  }
}

/**
 * Normalize plan name to match PLAN_TYPES
 */
export function normalizePlanName(planName: string): PlanType {
  const normalized = planName.toLowerCase().trim();

  if (normalized.includes('max')) {
    return PLAN_TYPES.MAX;
  }
  if (normalized.includes('pro')) {
    return PLAN_TYPES.PRO;
  }
  if (normalized.includes('free')) {
    return PLAN_TYPES.FREE;
  }

  // Default to FREE for unknown plans
  return PLAN_TYPES.FREE;
}

/**
 * Check if a plan is paid (not FREE)
 */
export function isPaidPlan(planName: string): boolean {
  const normalized = normalizePlanName(planName);
  return normalized !== PLAN_TYPES.FREE;
}

/**
 * Get plan display name
 */
export function getPlanDisplayName(planName: string): string {
  const normalized = normalizePlanName(planName);

  switch (normalized) {
    case PLAN_TYPES.MAX:
      return 'Max';
    case PLAN_TYPES.PRO:
      return 'Pro';
    case PLAN_TYPES.FREE:
    default:
      return 'Free';
  }
}
