/**
 * Subscription Utilities
 * Helper functions for subscription management
 */

import { getAuthEnv } from '../env';
import type { Subscription, AuthUser, Organization } from '../types';
import { PLAN_TYPES, type PlanType } from '../subscription-limits';

/**
 * Get user's subscription from the main site
 */
export async function getSubscription(userId: string): Promise<Subscription & { plan: string }> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/subscriptions/user/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[Subscription] No subscription found for user ${userId}`);
      return {
        id: '',
        plan: 'FREE',
        status: 'active',
        referenceId: userId,
      };
    }

    const data = (await response.json()) as Subscription;
    return {
      ...data,
      plan: data.plan || 'FREE',
    };
  } catch (error) {
    console.error('[Subscription] Error fetching subscription:', error);
    return {
      id: '',
      plan: 'FREE',
      status: 'active',
      referenceId: userId,
    };
  }
}

/**
 * Get organization's subscription
 */
export async function getOrganizationSubscription(
  organizationId: string
): Promise<Subscription & { plan: string }> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/subscriptions/organization/${organizationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[Subscription] No subscription found for organization ${organizationId}`);
      return {
        id: '',
        plan: 'FREE',
        status: 'active',
        referenceId: organizationId,
      };
    }

    return (await response.json()) as Subscription & { plan: string };
  } catch (error) {
    console.error('[Subscription] Error fetching organization subscription:', error);
    return {
      id: '',
      plan: 'FREE',
      status: 'active',
      referenceId: organizationId,
    };
  }
}

/**
 * Check if user has a paid subscription
 */
export async function hasPaidSubscription(userId: string): Promise<boolean> {
  const subscription = await getSubscription(userId);
  const plan = subscription.plan.toLowerCase();

  return (
    plan !== 'free' &&
    plan !== 'recoder free' &&
    subscription.status === 'active'
  );
}

/**
 * Check if user has a specific plan or higher
 */
export async function hasMinimumPlan(
  userId: string,
  minimumPlan: 'free' | 'pro' | 'max'
): Promise<boolean> {
  const subscription = await getSubscription(userId);
  const plan = subscription.plan.toLowerCase();

  const planHierarchy: Record<string, number> = {
    free: 0,
    'recoder free': 0,
    pro: 1,
    'recoder pro': 1,
    max: 2,
    'recoder max': 2,
  };

  const minimumHierarchy: Record<string, number> = {
    free: 0,
    pro: 1,
    max: 2,
  };

  const userLevel = planHierarchy[plan] ?? 0;
  const requiredLevel = minimumHierarchy[minimumPlan] ?? 0;

  return userLevel >= requiredLevel && subscription.status === 'active';
}

/**
 * Get user's active organization
 */
export async function getActiveOrganization(userId: string): Promise<Organization | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/users/${userId}/organization`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[Subscription] No organization found for user ${userId}`);
      return null;
    }

    return (await response.json()) as Organization;
  } catch (error) {
    console.error('[Subscription] Error fetching organization:', error);
    return null;
  }
}

/**
 * Get organization owner's user ID
 */
export async function getOrganizationOwnerUserId(organizationId: string): Promise<string | null> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(`${mainSiteUrl}/api/organizations/${organizationId}/owner`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { userId?: string };
    return data.userId || null;
  } catch (error) {
    console.error('[Subscription] Error fetching organization owner:', error);
    return null;
  }
}

/**
 * Check if organization member has a specific role
 */
export async function hasOrganizationRole(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<boolean> {
  const env = getAuthEnv();
  const mainSiteUrl = env.MAIN_SITE_URL || 'https://recoder.xyz';

  try {
    const response = await fetch(
      `${mainSiteUrl}/api/organizations/${organizationId}/members/${userId}/role`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { role?: string };
    const userRole = data.role;

    // Role hierarchy
    const roleHierarchy: Record<string, number> = {
      member: 0,
      admin: 1,
      owner: 2,
    };

    const requiredHierarchy: Record<string, number> = {
      member: 0,
      admin: 1,
      owner: 2,
    };

    const userLevel = roleHierarchy[userRole || 'member'] ?? 0;
    const requiredLevel = requiredHierarchy[role] ?? 0;

    return userLevel >= requiredLevel;
  } catch (error) {
    console.error('[Subscription] Error checking organization role:', error);
    return false;
  }
}

/**
 * Get subscription plan display name
 */
export function getSubscriptionPlanDisplayName(plan: string): string {
  const normalized = plan.toLowerCase();

  if (normalized.includes('max')) {
    return 'Max';
  }
  if (normalized.includes('pro')) {
    return 'Pro';
  }
  return 'Free';
}

/**
 * Get subscription status display text
 */
export function getSubscriptionStatusDisplay(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'canceled':
      return 'Cancelled';
    case 'past_due':
      return 'Past Due';
    case 'unpaid':
      return 'Unpaid';
    case 'trialing':
      return 'Trial';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Check if subscription is in a good standing state
 */
export function isSubscriptionActive(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Check if subscription needs attention (payment issues)
 */
export function subscriptionNeedsAttention(status: string): boolean {
  return status === 'past_due' || status === 'unpaid';
}
