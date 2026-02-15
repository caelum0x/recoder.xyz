/**
 * Subscription Manager
 * Manages subscription state and operations using nanostores
 * Provides reactive subscription management for the frontend
 */

import { atom, computed, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import {
  BillingError,
  BillingErrorCodes,
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type PlanTier,
  type PolarCustomer,
  type PolarSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type UsageSummary,
  type UsageType,
} from './types';

const logger = createScopedLogger('SubscriptionManager');

// ==================== Subscription Plans Configuration ====================

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    description: 'Perfect for trying out Recoder',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      { name: 'Basic sandbox access', included: true },
      { name: 'Community support', included: true },
      { name: 'Public projects', included: true },
      { name: 'Private projects', included: false },
      { name: 'Priority support', included: false },
      { name: 'Advanced AI features', included: false },
    ],
    limits: {
      sandboxMinutes: 60,
      aiTokens: 10000,
      storageGb: 1,
      deployments: 3,
      apiRequests: 1000,
    },
  },
  {
    id: 'starter',
    tier: 'starter',
    name: 'Starter',
    description: 'For individual developers',
    monthlyPrice: 900, // $9/month
    yearlyPrice: 9000, // $90/year (save $18)
    features: [
      { name: 'Extended sandbox access', included: true },
      { name: 'Email support', included: true },
      { name: 'Public projects', included: true },
      { name: 'Private projects', included: true, limit: 5 },
      { name: 'Priority support', included: false },
      { name: 'Advanced AI features', included: false },
    ],
    limits: {
      sandboxMinutes: 300,
      aiTokens: 100000,
      storageGb: 5,
      deployments: 20,
      apiRequests: 10000,
    },
  },
  {
    id: 'pro',
    tier: 'pro',
    name: 'Pro',
    description: 'For professional developers and small teams',
    monthlyPrice: 2900, // $29/month
    yearlyPrice: 29000, // $290/year (save $58)
    features: [
      { name: 'Unlimited sandbox access', included: true },
      { name: 'Priority support', included: true },
      { name: 'Public projects', included: true },
      { name: 'Private projects', included: true },
      { name: 'Team collaboration', included: true, limit: 5 },
      { name: 'Advanced AI features', included: true },
      { name: 'Custom domains', included: true },
    ],
    limits: {
      sandboxMinutes: 1000,
      aiTokens: 500000,
      storageGb: 20,
      deployments: 100,
      apiRequests: 100000,
    },
  },
  {
    id: 'enterprise',
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams and organizations',
    monthlyPrice: 9900, // $99/month
    yearlyPrice: 99000, // $990/year (save $198)
    features: [
      { name: 'Unlimited everything', included: true },
      { name: 'Dedicated support', included: true },
      { name: 'SSO/SAML', included: true },
      { name: 'Audit logs', included: true },
      { name: 'SLA guarantee', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'On-premise deployment', included: true },
    ],
    limits: {
      sandboxMinutes: -1, // unlimited
      aiTokens: -1,
      storageGb: 100,
      deployments: -1,
      apiRequests: -1,
    },
  },
];

// ==================== Nanostores State ====================

/**
 * Current customer information
 */
export const currentCustomer = atom<PolarCustomer | null>(null);

/**
 * Current subscription
 */
export const currentSubscription = atom<PolarSubscription | null>(null);

/**
 * Subscription status derived from current subscription
 */
export const subscriptionStatus = computed(
  currentSubscription,
  (sub): SubscriptionStatus | 'none' => {
    if (!sub) return 'none';
    return sub.status;
  }
);

/**
 * Current plan tier derived from subscription
 */
export const currentPlanTier = computed(
  currentSubscription,
  (sub): PlanTier => {
    if (!sub || sub.status === 'canceled') return 'free';
    // In a real implementation, you'd look up the tier from the product ID
    const planId = sub.metadata?.planId as string | undefined;
    if (planId && ['starter', 'pro', 'enterprise'].includes(planId)) {
      return planId as PlanTier;
    }
    return 'free';
  }
);

/**
 * Current plan details
 */
export const currentPlan = computed(
  currentPlanTier,
  (tier): SubscriptionPlan => {
    return SUBSCRIPTION_PLANS.find(p => p.tier === tier) || SUBSCRIPTION_PLANS[0];
  }
);

/**
 * Whether the subscription is active
 */
export const isSubscriptionActive = computed(
  subscriptionStatus,
  (status): boolean => {
    return status === 'active' || status === 'trialing';
  }
);

/**
 * Whether the subscription is in trial
 */
export const isTrialing = computed(
  subscriptionStatus,
  (status): boolean => {
    return status === 'trialing';
  }
);

/**
 * Trial days remaining
 */
export const trialDaysRemaining = computed(
  currentSubscription,
  (sub): number | null => {
    if (!sub || !sub.trialEnd) return null;
    const now = new Date();
    const trialEnd = new Date(sub.trialEnd);
    const diff = trialEnd.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
);

/**
 * Subscription loading state
 */
export const isSubscriptionLoading = atom<boolean>(false);

/**
 * Subscription error state
 */
export const subscriptionError = atom<string | null>(null);

/**
 * Usage summary for current subscription
 */
export const usageSummary = map<Record<UsageType, UsageSummary>>({} as Record<UsageType, UsageSummary>);

/**
 * Whether any usage is approaching limit (>80%)
 */
export const isApproachingLimits = computed(
  usageSummary,
  (usage): boolean => {
    return Object.values(usage).some(u => u.percentage >= 80);
  }
);

/**
 * Whether any usage has exceeded limit
 */
export const hasExceededLimits = computed(
  usageSummary,
  (usage): boolean => {
    return Object.values(usage).some(u => u.percentage >= 100);
  }
);

// ==================== Subscription Actions ====================

/**
 * Set the current customer
 */
export function setCustomer(customer: PolarCustomer | null): void {
  currentCustomer.set(customer);
}

/**
 * Set the current subscription
 */
export function setSubscription(subscription: PolarSubscription | null): void {
  currentSubscription.set(subscription);
}

/**
 * Update usage summary
 */
export function updateUsageSummary(summary: UsageSummary[]): void {
  const summaryMap: Record<UsageType, UsageSummary> = {} as Record<UsageType, UsageSummary>;
  for (const item of summary) {
    summaryMap[item.usageType] = item;
  }
  usageSummary.set(summaryMap);
}

/**
 * Clear all subscription state
 */
export function clearSubscriptionState(): void {
  currentCustomer.set(null);
  currentSubscription.set(null);
  usageSummary.set({} as Record<UsageType, UsageSummary>);
  subscriptionError.set(null);
}

// ==================== API Integration ====================

// Backend API base URL
const API_BASE = '/api/billing';

/**
 * Fetch current subscription from backend
 */
export async function fetchSubscription(): Promise<PolarSubscription | null> {
  isSubscriptionLoading.set(true);
  subscriptionError.set(null);

  try {
    const response = await fetch(`${API_BASE}/subscription`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) {
        setSubscription(null);
        return null;
      }
      throw new Error(`Failed to fetch subscription: ${response.status}`);
    }

    const data = (await response.json()) as { subscription: any; customer?: any };
    const subscription = normalizeSubscription(data.subscription);
    setSubscription(subscription);

    if (data.customer) {
      setCustomer(normalizeCustomer(data.customer));
    }

    return subscription;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscription';
    subscriptionError.set(message);
    throw new BillingError(message, BillingErrorCodes.API_ERROR);
  } finally {
    isSubscriptionLoading.set(false);
  }
}

/**
 * Create a checkout session for subscription
 */
export async function createSubscriptionCheckout(params: {
  planId: string;
  interval: 'month' | 'year';
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CreateCheckoutResponse> {
  isSubscriptionLoading.set(true);
  subscriptionError.set(null);

  try {
    const response = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        planId: params.planId,
        interval: params.interval,
        successUrl: params.successUrl || `${window.location.origin}/billing/success`,
        cancelUrl: params.cancelUrl || `${window.location.origin}/billing`,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Failed to create checkout: ${response.status}`);
    }

    const data = (await response.json()) as { checkoutId: string; checkoutUrl: string; expiresAt: string };
    return {
      checkoutId: data.checkoutId,
      checkoutUrl: data.checkoutUrl,
      expiresAt: new Date(data.expiresAt),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create checkout';
    subscriptionError.set(message);
    throw new BillingError(message, BillingErrorCodes.CHECKOUT_FAILED);
  } finally {
    isSubscriptionLoading.set(false);
  }
}

/**
 * Cancel the current subscription
 */
export async function cancelCurrentSubscription(params?: {
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}): Promise<void> {
  const subscription = currentSubscription.get();
  if (!subscription) {
    throw new BillingError(
      'No active subscription to cancel',
      BillingErrorCodes.SUBSCRIPTION_NOT_FOUND
    );
  }

  isSubscriptionLoading.set(true);
  subscriptionError.set(null);

  try {
    const response = await fetch(`${API_BASE}/subscription/cancel`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancelAtPeriodEnd: params?.cancelAtPeriodEnd ?? true,
        reason: params?.reason,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Failed to cancel subscription: ${response.status}`);
    }

    const data = (await response.json()) as { subscription: any };
    setSubscription(normalizeSubscription(data.subscription));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription';
    subscriptionError.set(message);
    throw new BillingError(message, BillingErrorCodes.API_ERROR);
  } finally {
    isSubscriptionLoading.set(false);
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(): Promise<void> {
  const subscription = currentSubscription.get();
  if (!subscription || !subscription.cancelAtPeriodEnd) {
    throw new BillingError(
      'No canceled subscription to reactivate',
      BillingErrorCodes.SUBSCRIPTION_NOT_FOUND
    );
  }

  isSubscriptionLoading.set(true);
  subscriptionError.set(null);

  try {
    const response = await fetch(`${API_BASE}/subscription/reactivate`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Failed to reactivate subscription: ${response.status}`);
    }

    const data = (await response.json()) as { subscription: any };
    setSubscription(normalizeSubscription(data.subscription));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reactivate subscription';
    subscriptionError.set(message);
    throw new BillingError(message, BillingErrorCodes.API_ERROR);
  } finally {
    isSubscriptionLoading.set(false);
  }
}

/**
 * Change subscription plan
 */
export async function changePlan(params: {
  planId: string;
  interval?: 'month' | 'year';
}): Promise<void> {
  isSubscriptionLoading.set(true);
  subscriptionError.set(null);

  try {
    const response = await fetch(`${API_BASE}/subscription/change-plan`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Failed to change plan: ${response.status}`);
    }

    const data = (await response.json()) as { subscription: any };
    setSubscription(normalizeSubscription(data.subscription));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to change plan';
    subscriptionError.set(message);
    throw new BillingError(message, BillingErrorCodes.API_ERROR);
  } finally {
    isSubscriptionLoading.set(false);
  }
}

/**
 * Fetch usage summary for current subscription
 */
export async function fetchUsageSummary(): Promise<UsageSummary[]> {
  const subscription = currentSubscription.get();
  if (!subscription) {
    return [];
  }

  try {
    const response = await fetch(`${API_BASE}/usage`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch usage: ${response.status}`);
    }

    const data = (await response.json()) as { usage: UsageSummary[] };
    const summary = data.usage;
    updateUsageSummary(summary);
    return summary;
  } catch (error) {
    logger.error('Failed to fetch usage summary:', error);
    return [];
  }
}

// ==================== Helper Functions ====================

/**
 * Get plan by tier
 */
export function getPlanByTier(tier: PlanTier): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.tier === tier);
}

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId);
}

/**
 * Check if user can access a feature
 */
export function canAccessFeature(feature: string): boolean {
  const plan = currentPlan.get();
  const featureConfig = plan.features.find(f => f.name === feature);
  return featureConfig?.included ?? false;
}

/**
 * Get usage limit for a type
 */
export function getUsageLimit(usageType: UsageType): number {
  const plan = currentPlan.get();
  switch (usageType) {
    case 'sandbox_minutes':
      return plan.limits.sandboxMinutes;
    case 'ai_tokens':
      return plan.limits.aiTokens;
    case 'storage_gb':
      return plan.limits.storageGb;
    case 'deployments':
      return plan.limits.deployments;
    case 'api_requests':
      return plan.limits.apiRequests;
    default:
      return 0;
  }
}

/**
 * Check if usage type is approaching limit
 */
export function isApproachingLimit(usageType: UsageType): boolean {
  const summary = usageSummary.get()[usageType];
  if (!summary) return false;
  return summary.percentage >= 80 && summary.percentage < 100;
}

/**
 * Check if usage type has exceeded limit
 */
export function hasExceededLimit(usageType: UsageType): boolean {
  const summary = usageSummary.get()[usageType];
  if (!summary) return false;
  return summary.percentage >= 100;
}

/**
 * Format price for display
 */
export function formatPrice(amountInCents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountInCents / 100);
}

/**
 * Get days until subscription renewal
 */
export function getDaysUntilRenewal(): number | null {
  const subscription = currentSubscription.get();
  if (!subscription) return null;

  const now = new Date();
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const diff = periodEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ==================== Normalization Helpers ====================

function normalizeSubscription(sub: any): PolarSubscription {
  return {
    ...sub,
    currentPeriodStart: new Date(sub.currentPeriodStart),
    currentPeriodEnd: new Date(sub.currentPeriodEnd),
    canceledAt: sub.canceledAt ? new Date(sub.canceledAt) : undefined,
    endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
    trialStart: sub.trialStart ? new Date(sub.trialStart) : undefined,
    trialEnd: sub.trialEnd ? new Date(sub.trialEnd) : undefined,
    createdAt: new Date(sub.createdAt),
  };
}

function normalizeCustomer(customer: any): PolarCustomer {
  return {
    ...customer,
    createdAt: new Date(customer.createdAt),
  };
}

// ==================== Initialization ====================

/**
 * Initialize subscription state from backend
 */
export async function initializeSubscription(): Promise<void> {
  try {
    await fetchSubscription();
    await fetchUsageSummary();
  } catch (error) {
    logger.error('Failed to initialize subscription:', error);
  }
}
