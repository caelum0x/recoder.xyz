/**
 * Subscription Limits Types
 * Type definitions for subscription limit management
 */

// Re-export from main types for convenience
export {
  PLAN_TYPES,
  type PlanType,
  type PlanLimits,
  type PlanDetails,
  type SubscriptionLimitRecord,
  type SubscriptionUsage,
  type QuotaDeductionResult,
} from '../types';

/**
 * Quota types that can be deducted
 */
export type QuotaType = 'aiNums' | 'enhanceNums' | 'uploadLimit' | 'deployLimit' | 'projectNums';

/**
 * Billing interval for subscriptions
 */
export type BillingInterval = 'month' | 'year';

/**
 * Annual quota refresh result
 */
export interface AnnualQuotaRefreshResult {
  success: boolean;
  remaining?: number;
  reason?: 'insufficient' | 'concurrency' | 'not_found' | 'expired' | 'invalid';
}

/**
 * Combined project quota
 */
export interface CombinedProjectQuota {
  projectNums: number;
  projectNumsLimit: number;
  plan: string;
  periodEnd?: string;
  planDetails: {
    free: {
      projectNums: number;
      projectNumsLimit: number;
      plan: string;
      periodEnd: string;
    } | null;
    paid: {
      projectNums: number;
      projectNumsLimit: number;
      plan: string;
      periodEnd: string;
    } | null;
  };
}

/**
 * Quota restoration result
 */
export interface QuotaRestorationResult {
  success: boolean;
  restoredTo?: 'PAID' | 'FREE';
  planName?: string;
  error?: string;
}

/**
 * Subscription limit creation parameters
 */
export interface CreateSubscriptionLimitParams {
  organizationId: string;
  stripeCustomerId: string | null;
  plan: string;
  periodStart: Date;
  periodEnd: Date;
  customLimits?: {
    aiNums?: number;
    seats?: number;
    projectNums?: number;
  };
  billingInterval?: BillingInterval;
}
