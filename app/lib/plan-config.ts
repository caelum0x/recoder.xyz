/**
 * Subscription Plan Configuration
 * Defines limits and features for each plan tier
 */

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  monthlyRequests: number; // -1 for unlimited
  requiresOwnApiKey: boolean;
  features: string[];
  maxConcurrentSessions: number; // -1 for unlimited
  rateLimit: number; // requests per minute, -1 for unlimited
  tokensPerMonth: number; // -1 for unlimited
  prioritySupport: boolean;
  advancedModels: boolean;
  routerOptimization: boolean;
  analyticsRetention: number; // days
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    monthlyRequests: 1000,
    requiresOwnApiKey: true, // Free users must provide their own OpenRouter API key
    features: [
      'cli_access',
      'basic_generation',
      'web_interface',
      'community_support'
    ],
    maxConcurrentSessions: 1,
    rateLimit: 10, // 10 requests per minute
    tokensPerMonth: -1, // No token limit (they use their own key)
    prioritySupport: false,
    advancedModels: false,
    routerOptimization: false,
    analyticsRetention: 7 // 7 days
  },
  
  pro: {
    monthlyRequests: 50000,
    requiresOwnApiKey: false, // Platform provides API keys
    features: [
      'cli_access',
      'advanced_generation',
      'web_interface',
      'router_optimization',
      'priority_support',
      'analytics_dashboard',
      'team_collaboration',
      'custom_models'
    ],
    maxConcurrentSessions: 5,
    rateLimit: 100, // 100 requests per minute
    tokensPerMonth: 10000000, // 10M tokens per month
    prioritySupport: true,
    advancedModels: true,
    routerOptimization: true,
    analyticsRetention: 90 // 90 days
  },
  
  enterprise: {
    monthlyRequests: -1, // Unlimited
    requiresOwnApiKey: false, // Platform provides API keys
    features: [
      'everything',
      'unlimited_requests',
      'custom_models',
      'dedicated_support',
      'sla_guarantee',
      'custom_deployment',
      'advanced_security',
      'audit_logs',
      'sso',
      'priority_routing',
      'custom_integrations'
    ],
    maxConcurrentSessions: -1, // Unlimited
    rateLimit: -1, // Unlimited
    tokensPerMonth: -1, // Unlimited
    prioritySupport: true,
    advancedModels: true,
    routerOptimization: true,
    analyticsRetention: 365 // 1 year
  }
};

/**
 * Get plan limits for a specific plan
 */
export function getPlanLimits(plan: string): PlanLimits {
  const planType = (plan?.toLowerCase() || 'free') as PlanType;
  return PLAN_LIMITS[planType] || PLAN_LIMITS.free;
}

/**
 * Check if a plan has a specific feature
 */
export function hasFeature(plan: string, feature: string): boolean {
  const limits = getPlanLimits(plan);
  return limits.features.includes(feature) || limits.features.includes('everything');
}

/**
 * Check if user can make a request based on their plan
 */
export function canMakeRequest(
  plan: string,
  requestsUsed: number,
  requestsInLastMinute: number = 0
): {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
} {
  const limits = getPlanLimits(plan);
  
  // Check monthly limit
  if (limits.monthlyRequests !== -1 && requestsUsed >= limits.monthlyRequests) {
    return {
      allowed: false,
      reason: `Monthly limit of ${limits.monthlyRequests} requests reached`,
      upgradeRequired: true
    };
  }
  
  // Check rate limit
  if (limits.rateLimit !== -1 && requestsInLastMinute >= limits.rateLimit) {
    return {
      allowed: false,
      reason: `Rate limit of ${limits.rateLimit} requests per minute exceeded`,
      upgradeRequired: false
    };
  }
  
  return { allowed: true };
}

/**
 * Get plan pricing information
 */
export const PLAN_PRICING = {
  free: {
    monthly: 0,
    yearly: 0,
    currency: 'USD',
    billingCycle: 'monthly'
  },
  pro: {
    monthly: 29.99,
    yearly: 299.99, // ~$25/month
    currency: 'USD',
    billingCycle: 'monthly'
  },
  enterprise: {
    monthly: 299.99,
    yearly: 2999.99,
    currency: 'USD',
    billingCycle: 'monthly',
    custom: true // Contact sales
  }
};

/**
 * Get upgrade suggestions based on usage
 */
export function getUpgradeSuggestion(
  currentPlan: PlanType,
  requestsUsed: number,
  usagePattern: {
    avgRequestsPerDay: number;
    peakRequestsPerMinute: number;
  }
): {
  shouldUpgrade: boolean;
  suggestedPlan?: PlanType;
  reason?: string;
} {
  const currentLimits = PLAN_LIMITS[currentPlan];
  
  // Already on highest plan
  if (currentPlan === 'enterprise') {
    return { shouldUpgrade: false };
  }
  
  // Check if approaching monthly limit
  if (currentLimits.monthlyRequests !== -1) {
    const usagePercent = (requestsUsed / currentLimits.monthlyRequests) * 100;
    if (usagePercent > 80) {
      return {
        shouldUpgrade: true,
        suggestedPlan: currentPlan === 'free' ? 'pro' : 'enterprise',
        reason: `You've used ${usagePercent.toFixed(0)}% of your monthly quota`
      };
    }
  }
  
  // Check if hitting rate limits frequently
  if (currentLimits.rateLimit !== -1 && usagePattern.peakRequestsPerMinute > currentLimits.rateLimit * 0.8) {
    return {
      shouldUpgrade: true,
      suggestedPlan: currentPlan === 'free' ? 'pro' : 'enterprise',
      reason: 'You frequently hit rate limits. Upgrade for higher throughput.'
    };
  }
  
  // Check projected usage
  const projectedMonthlyRequests = usagePattern.avgRequestsPerDay * 30;
  if (currentLimits.monthlyRequests !== -1 && projectedMonthlyRequests > currentLimits.monthlyRequests) {
    return {
      shouldUpgrade: true,
      suggestedPlan: currentPlan === 'free' ? 'pro' : 'enterprise',
      reason: `Projected usage (${projectedMonthlyRequests.toFixed(0)} req/month) exceeds your plan`
    };
  }
  
  return { shouldUpgrade: false };
}

/**
 * Calculate cost savings with router optimization (Pro/Enterprise only)
 */
export function calculateRouterSavings(
  requestsCount: number,
  avgTokensPerRequest: number = 2000
): {
  withoutRouter: number;
  withRouter: number;
  savings: number;
  savingsPercent: number;
} {
  // Average cost per token without optimization: $0.00002
  // With router optimization: $0.000012 (40% savings)
  const costPerTokenWithout = 0.00002;
  const costPerTokenWith = 0.000012;
  
  const totalTokens = requestsCount * avgTokensPerRequest;
  const withoutRouter = totalTokens * costPerTokenWithout;
  const withRouter = totalTokens * costPerTokenWith;
  const savings = withoutRouter - withRouter;
  const savingsPercent = (savings / withoutRouter) * 100;
  
  return {
    withoutRouter,
    withRouter,
    savings,
    savingsPercent
  };
}

export default PLAN_LIMITS;
