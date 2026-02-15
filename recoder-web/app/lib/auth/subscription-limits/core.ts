/**
 * Subscription Limits Core
 * Core functions for subscription limit management
 * These functions call the main site API for actual database operations
 */

import {
  PLAN_TYPES,
  type PlanType,
  type SubscriptionUsage,
  type QuotaDeductionResult,
  type CombinedProjectQuota,
  type QuotaRestorationResult,
  type QuotaType,
  type CreateSubscriptionLimitParams,
} from './types';
import { getAuthEnv } from '../env';
import { getPlanLimits } from './constants';
import { createDefaultUsage, isPeriodExpired } from './utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SubscriptionLimits');

/**
 * Create or update subscription limits for an organization
 * Calls the main site API to perform the database operation
 */
export async function createOrUpdateSubscriptionLimit(
  params: CreateSubscriptionLimitParams
): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  const response = await fetch(`${mainSiteUrl}/api/subscription-limits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      organizationId: params.organizationId,
      stripeCustomerId: params.stripeCustomerId,
      plan: params.plan,
      periodStart: params.periodStart.toISOString(),
      periodEnd: params.periodEnd.toISOString(),
      customLimits: params.customLimits,
      billingInterval: params.billingInterval,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('[SubscriptionLimits] Failed to create/update subscription limit:', error);
    throw new Error('Failed to create/update subscription limit');
  }

  logger.info(`[SubscriptionLimits] Created/updated subscription limit for org ${params.organizationId}`);
}

/**
 * Cancel subscription limits for an organization
 * Only cancels paid plans, preserves FREE plan
 */
export async function cancelSubscriptionLimits(organizationId: string): Promise<void> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  const response = await fetch(`${mainSiteUrl}/api/subscription-limits/${organizationId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('[SubscriptionLimits] Failed to cancel subscription limits:', error);
    throw new Error('Failed to cancel subscription limits');
  }

  logger.info(`[SubscriptionLimits] Cancelled subscription limits for org ${organizationId}`);
}

/**
 * Get subscription usage for an organization
 */
export async function getSubscriptionUsage(organizationId: string): Promise<SubscriptionUsage> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/subscription-limits/${organizationId}/usage`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error(`[SubscriptionLimits] Failed to get usage: ${response.status}`);
      return createDefaultUsage();
    }

    const data = (await response.json()) as SubscriptionUsage;
    return data;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error getting subscription usage:', error);
    return createDefaultUsage();
  }
}

/**
 * Check and update AI message usage (deduct quota)
 * Priority: FREE plan first, then paid plan
 */
export async function checkAndUpdateAIMessageUsage(organizationId: string): Promise<boolean> {
  return deductQuota(organizationId, 'aiNums');
}

/**
 * Check and update enhance usage (deduct quota)
 */
export async function checkAndUpdateEnhanceUsage(organizationId: string): Promise<boolean> {
  return deductQuota(organizationId, 'enhanceNums');
}

/**
 * Check and update project usage (deduct quota)
 */
export async function checkAndUpdateProjectUsage(organizationId: string): Promise<boolean> {
  return deductQuota(organizationId, 'projectNums');
}

/**
 * Check and update deploy usage (deduct quota)
 */
export async function checkAndUpdateDeployUsage(organizationId: string): Promise<boolean> {
  return deductQuota(organizationId, 'deployLimit');
}

/**
 * Generic quota deduction function
 */
export async function deductQuota(
  organizationId: string,
  quotaType: QuotaType,
  amount: number = 1
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/subscription-limits/${organizationId}/deduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quotaType,
        amount,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      logger.error(`[SubscriptionLimits] Quota deduction failed: ${data.error || 'Unknown error'}`);
      return false;
    }

    const result = (await response.json()) as QuotaDeductionResult;
    logger.info(
      `[SubscriptionLimits] Quota deducted: ${quotaType} from ${result.source || 'unknown'} plan, remaining: ${result.remaining}`
    );
    return result.success;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error deducting quota:', error);
    return false;
  }
}

/**
 * Get combined project quota from both FREE and PAID plans
 */
export async function getCombinedProjectQuota(organizationId: string): Promise<CombinedProjectQuota> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/subscription-limits/${organizationId}/project-quota`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      logger.error(`[SubscriptionLimits] Failed to get project quota: ${response.status}`);
      return {
        projectNums: 0,
        projectNumsLimit: 0,
        plan: PLAN_TYPES.FREE,
        planDetails: { free: null, paid: null },
      };
    }

    return (await response.json()) as CombinedProjectQuota;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error getting project quota:', error);
    return {
      projectNums: 0,
      projectNumsLimit: 0,
      plan: PLAN_TYPES.FREE,
      planDetails: { free: null, paid: null },
    };
  }
}

/**
 * Restore project quota when a project is deleted
 */
export async function restoreProjectQuotaOnDeletion(
  organizationId: string
): Promise<QuotaRestorationResult> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/subscription-limits/${organizationId}/restore-project`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return (await response.json()) as QuotaRestorationResult;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error restoring project quota:', error);
    return { success: false, error: 'Failed to restore quota' };
  }
}

/**
 * Check and refresh annual subscription quota if needed
 */
export async function checkAndRefreshAnnualQuota(organizationId: string): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/subscription-limits/${organizationId}/refresh-annual`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { refreshed: boolean };
    return data.refreshed;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error refreshing annual quota:', error);
    return false;
  }
}

/**
 * Check refresh and deduct quota for annual subscriptions
 * Combined operation for efficiency
 */
export async function checkRefreshAndDeductQuota(
  organizationId: string,
  quotaType: QuotaType,
  deductAmount: number = 1
): Promise<QuotaDeductionResult> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/subscription-limits/${organizationId}/refresh-and-deduct`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quotaType,
          deductAmount,
        }),
      }
    );

    if (!response.ok) {
      const data = (await response.json()) as { error?: string; reason?: string };
      return {
        success: false,
        reason: (data.reason as QuotaDeductionResult['reason']) || 'not_found',
      };
    }

    return (await response.json()) as QuotaDeductionResult;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error in refresh and deduct:', error);
    return { success: false, reason: 'concurrency' };
  }
}

/**
 * Unified quota deduction entry point
 * Handles annual subscription refresh automatically
 */
export async function deductQuotaUnified(
  organizationId: string,
  quotaType: QuotaType,
  deductAmount: number = 1
): Promise<QuotaDeductionResult> {
  // First try annual subscription quota refresh and deduction
  try {
    const annualResult = await checkRefreshAndDeductQuota(organizationId, quotaType, deductAmount);
    if (annualResult.success) {
      return {
        success: true,
        remaining: annualResult.remaining,
        source: 'annual',
      };
    }
  } catch (error) {
    logger.warn('[SubscriptionLimits] Annual quota deduction failed, using fallback');
  }

  // Fallback to regular quota deduction
  const success = await deductQuota(organizationId, quotaType, deductAmount);
  return {
    success,
    source: 'fallback',
  };
}

/**
 * Check if organization has available quota
 */
export async function hasAvailableQuota(
  organizationId: string,
  quotaType: QuotaType
): Promise<boolean> {
  try {
    const usage = await getSubscriptionUsage(organizationId);

    switch (quotaType) {
      case 'aiNums':
        return usage.aiNums > 0;
      case 'enhanceNums':
        // enhanceNums uses aiNums as source in many cases
        return usage.aiNums > 0;
      case 'projectNums':
        return usage.projectNums > 0;
      case 'uploadLimit':
        return usage.aiNums > 0; // Often same as aiNums
      case 'deployLimit':
        return usage.aiNums > 0; // Often derived from aiNums
      default:
        return false;
    }
  } catch (error) {
    logger.error('[SubscriptionLimits] Error checking quota:', error);
    return false;
  }
}

/**
 * Get organization's current plan
 */
export async function getOrganizationPlan(organizationId: string): Promise<PlanType> {
  try {
    const usage = await getSubscriptionUsage(organizationId);
    return (usage.plan as PlanType) || PLAN_TYPES.FREE;
  } catch (error) {
    logger.error('[SubscriptionLimits] Error getting plan:', error);
    return PLAN_TYPES.FREE;
  }
}
