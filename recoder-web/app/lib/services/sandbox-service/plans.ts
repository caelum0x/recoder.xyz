/**
 * Sandbox Service Plans
 * Defines pricing plans and tiers for the commercial sandbox service
 *
 * Tiers:
 * - Free: Basic tier for exploration and learning
 * - Pro ($19/mo): Professional developers and small teams
 * - Enterprise ($99/mo): Organizations with advanced needs
 */

import type { SandboxPlan, SandboxTier, SandboxResourceLimits, PlanFeatures } from './types';

/**
 * Resource limits by tier
 */
export const TIER_LIMITS: Record<SandboxTier, SandboxResourceLimits> = {
  free: {
    maxSandboxes: 1,
    maxConcurrent: 1,
    cpuLimit: 500, // 0.5 CPU
    memoryLimit: 512, // 512 MB
    storageLimit: 1024, // 1 GB
    executionTimeLimit: 1800, // 30 minutes per session
    apiCallsPerMonth: 100,
    dailyComputeLimit: 1800, // 30 minutes per day
  },
  pro: {
    maxSandboxes: 10,
    maxConcurrent: 3,
    cpuLimit: 2000, // 2 CPUs
    memoryLimit: 2048, // 2 GB
    storageLimit: 10240, // 10 GB
    executionTimeLimit: -1, // Unlimited per session
    apiCallsPerMonth: 10000,
    dailyComputeLimit: -1, // Unlimited
  },
  enterprise: {
    maxSandboxes: -1, // Unlimited
    maxConcurrent: 10,
    cpuLimit: 8000, // 8 CPUs
    memoryLimit: 8192, // 8 GB
    storageLimit: 102400, // 100 GB
    executionTimeLimit: -1, // Unlimited
    apiCallsPerMonth: -1, // Unlimited
    dailyComputeLimit: -1, // Unlimited
  },
};

/**
 * Features by tier
 */
export const TIER_FEATURES: Record<SandboxTier, PlanFeatures> = {
  free: {
    prioritySupport: false,
    customDomains: false,
    teamCollaboration: false,
    advancedAnalytics: false,
    sshAccess: false,
    persistentStorage: false,
    gpuAccess: false,
    privateNetworking: false,
    snapshotRestore: false,
    cicdIntegration: false,
  },
  pro: {
    prioritySupport: true,
    customDomains: true,
    teamCollaboration: false,
    advancedAnalytics: true,
    sshAccess: true,
    persistentStorage: true,
    gpuAccess: false,
    privateNetworking: false,
    snapshotRestore: true,
    cicdIntegration: true,
  },
  enterprise: {
    prioritySupport: true,
    customDomains: true,
    teamCollaboration: true,
    advancedAnalytics: true,
    sshAccess: true,
    persistentStorage: true,
    gpuAccess: true,
    privateNetworking: true,
    snapshotRestore: true,
    cicdIntegration: true,
  },
};

/**
 * Complete plan definitions
 */
export const SANDBOX_PLANS: Record<SandboxTier, SandboxPlan> = {
  free: {
    id: 'plan_free',
    name: 'Free',
    tier: 'free',
    description: 'Perfect for exploring and learning. Get started with basic sandbox capabilities.',
    limits: TIER_LIMITS.free,
    pricing: {
      monthlyPriceCents: 0,
      annualPriceCents: 0,
    },
    features: TIER_FEATURES.free,
    isActive: true,
  },
  pro: {
    id: 'plan_pro',
    name: 'Pro',
    tier: 'pro',
    description: 'For professional developers who need more power and flexibility.',
    limits: TIER_LIMITS.pro,
    pricing: {
      monthlyPriceCents: 1900, // $19/month
      annualPriceCents: 19000, // $190/year (~17% savings)
      stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      stripePriceIdAnnual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
    features: TIER_FEATURES.pro,
    isActive: true,
    badge: 'Most Popular',
  },
  enterprise: {
    id: 'plan_enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    description: 'For organizations requiring unlimited resources, advanced security, and priority support.',
    limits: TIER_LIMITS.enterprise,
    pricing: {
      monthlyPriceCents: 9900, // $99/month
      annualPriceCents: 99000, // $990/year (~17% savings)
      stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      stripePriceIdAnnual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID,
    },
    features: TIER_FEATURES.enterprise,
    isActive: true,
  },
};

/**
 * Get plan by tier
 */
export function getPlan(tier: SandboxTier): SandboxPlan {
  return SANDBOX_PLANS[tier];
}

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): SandboxPlan | undefined {
  return Object.values(SANDBOX_PLANS).find(plan => plan.id === planId);
}

/**
 * Get all active plans
 */
export function getActivePlans(): SandboxPlan[] {
  return Object.values(SANDBOX_PLANS).filter(plan => plan.isActive);
}

/**
 * Get plans sorted by price (ascending)
 */
export function getPlansByPrice(): SandboxPlan[] {
  return getActivePlans().sort(
    (a, b) => a.pricing.monthlyPriceCents - b.pricing.monthlyPriceCents
  );
}

/**
 * Check if a tier can be upgraded to another
 */
export function canUpgrade(fromTier: SandboxTier, toTier: SandboxTier): boolean {
  const tierOrder: SandboxTier[] = ['free', 'pro', 'enterprise'];
  return tierOrder.indexOf(toTier) > tierOrder.indexOf(fromTier);
}

/**
 * Check if a tier can be downgraded to another
 */
export function canDowngrade(fromTier: SandboxTier, toTier: SandboxTier): boolean {
  const tierOrder: SandboxTier[] = ['free', 'pro', 'enterprise'];
  return tierOrder.indexOf(toTier) < tierOrder.indexOf(fromTier);
}

/**
 * Get the next higher tier
 */
export function getNextTier(currentTier: SandboxTier): SandboxTier | null {
  const tierOrder: SandboxTier[] = ['free', 'pro', 'enterprise'];
  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
    return null;
  }
  return tierOrder[currentIndex + 1];
}

/**
 * Format price for display
 */
export function formatPrice(cents: number, period: 'month' | 'year' = 'month'): string {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  const suffix = period === 'month' ? '/mo' : '/yr';
  return `$${dollars.toFixed(0)}${suffix}`;
}

/**
 * Calculate annual savings
 */
export function getAnnualSavings(plan: SandboxPlan): { amount: number; percentage: number } {
  const monthlyTotal = plan.pricing.monthlyPriceCents * 12;
  const annualTotal = plan.pricing.annualPriceCents;
  const savings = monthlyTotal - annualTotal;
  const percentage = monthlyTotal > 0 ? Math.round((savings / monthlyTotal) * 100) : 0;
  return { amount: savings, percentage };
}

/**
 * Format resource limit for display
 */
export function formatLimit(value: number, unit: string): string {
  if (value === -1) return 'Unlimited';

  switch (unit) {
    case 'MB':
      if (value >= 1024) {
        return `${(value / 1024).toFixed(0)} GB`;
      }
      return `${value} MB`;
    case 'seconds':
      if (value >= 3600) {
        return `${(value / 3600).toFixed(0)} hours`;
      }
      if (value >= 60) {
        return `${(value / 60).toFixed(0)} min`;
      }
      return `${value} sec`;
    case 'millicores':
      return `${(value / 1000).toFixed(1)} CPU`;
    default:
      return value.toLocaleString();
  }
}

/**
 * Get feature comparison for marketing
 */
export function getFeatureComparison(): {
  feature: string;
  description: string;
  free: boolean | string;
  pro: boolean | string;
  enterprise: boolean | string;
}[] {
  return [
    {
      feature: 'Sandboxes',
      description: 'Maximum number of sandboxes',
      free: '1',
      pro: '10',
      enterprise: 'Unlimited',
    },
    {
      feature: 'Concurrent Sandboxes',
      description: 'Run multiple sandboxes at once',
      free: '1',
      pro: '3',
      enterprise: '10',
    },
    {
      feature: 'Memory',
      description: 'RAM per sandbox',
      free: '512 MB',
      pro: '2 GB',
      enterprise: '8 GB',
    },
    {
      feature: 'Storage',
      description: 'Total storage across sandboxes',
      free: '1 GB',
      pro: '10 GB',
      enterprise: '100 GB',
    },
    {
      feature: 'Daily Compute',
      description: 'Compute time per day',
      free: '30 min',
      pro: 'Unlimited',
      enterprise: 'Unlimited',
    },
    {
      feature: 'API Calls',
      description: 'Monthly API call limit',
      free: '100',
      pro: '10,000',
      enterprise: 'Unlimited',
    },
    {
      feature: 'Priority Support',
      description: '24/7 priority support access',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'Custom Domains',
      description: 'Use your own domain for previews',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'SSH Access',
      description: 'Direct SSH access to sandboxes',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'Persistent Storage',
      description: 'Keep files between sessions',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'Snapshots',
      description: 'Save and restore sandbox states',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'CI/CD Integration',
      description: 'GitHub Actions, GitLab CI support',
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      feature: 'Team Collaboration',
      description: 'Share sandboxes with team members',
      free: false,
      pro: false,
      enterprise: true,
    },
    {
      feature: 'GPU Access',
      description: 'GPU-accelerated compute for ML',
      free: false,
      pro: false,
      enterprise: true,
    },
    {
      feature: 'Private Networking',
      description: 'Connect sandboxes privately',
      free: false,
      pro: false,
      enterprise: true,
    },
  ];
}

/**
 * Get plan highlights for marketing
 */
export function getPlanHighlights(tier: SandboxTier): string[] {
  const highlights: Record<SandboxTier, string[]> = {
    free: [
      '1 sandbox environment',
      '30 minutes daily compute',
      '1 GB storage',
      'Community support',
    ],
    pro: [
      'Up to 10 sandboxes',
      'Unlimited compute time',
      '10 GB storage',
      'Priority support',
      'SSH access',
      'CI/CD integration',
    ],
    enterprise: [
      'Unlimited sandboxes',
      'Unlimited everything',
      '100 GB storage',
      '24/7 priority support',
      'Team collaboration',
      'GPU access',
      'Private networking',
      'Custom SLA',
    ],
  };

  return highlights[tier];
}

/**
 * Overage pricing (for users who exceed limits on paid plans)
 */
export const OVERAGE_PRICING = {
  /** Price per 1000 API calls over limit (in cents) */
  apiCallsPer1000: 100, // $1 per 1000 calls
  /** Price per GB-hour of compute over limit (in cents) */
  computePerGBHour: 5, // $0.05 per GB-hour
  /** Price per GB of storage over limit per month (in cents) */
  storagePerGBMonth: 25, // $0.25 per GB/month
};

/**
 * Calculate overage cost
 */
export function calculateOverageCost(
  resource: 'apiCalls' | 'compute' | 'storage',
  overageAmount: number
): number {
  switch (resource) {
    case 'apiCalls':
      return Math.ceil(overageAmount / 1000) * OVERAGE_PRICING.apiCallsPer1000;
    case 'compute':
      return Math.ceil(overageAmount) * OVERAGE_PRICING.computePerGBHour;
    case 'storage':
      return Math.ceil(overageAmount) * OVERAGE_PRICING.storagePerGBMonth;
    default:
      return 0;
  }
}

/**
 * Trial configuration
 */
export const TRIAL_CONFIG = {
  /** Trial duration in days */
  durationDays: 14,
  /** Which tier to trial */
  trialTier: 'pro' as SandboxTier,
  /** Features restricted during trial */
  restrictedFeatures: [] as string[],
};

/**
 * Check if plan has a specific feature
 */
export function planHasFeature(
  tier: SandboxTier,
  feature: keyof PlanFeatures
): boolean {
  return TIER_FEATURES[tier][feature];
}

/**
 * Get resource limit for a tier
 */
export function getResourceLimit(
  tier: SandboxTier,
  resource: keyof SandboxResourceLimits
): number {
  return TIER_LIMITS[tier][resource];
}

/**
 * Compare two plans for upgrade/downgrade flow
 */
export function comparePlans(
  fromTier: SandboxTier,
  toTier: SandboxTier
): {
  direction: 'upgrade' | 'downgrade' | 'same';
  priceDiff: number;
  limitChanges: { resource: string; from: number; to: number; improved: boolean }[];
  featureChanges: { feature: string; gained: boolean }[];
} {
  const fromPlan = SANDBOX_PLANS[fromTier];
  const toPlan = SANDBOX_PLANS[toTier];

  const tierOrder: SandboxTier[] = ['free', 'pro', 'enterprise'];
  const fromIndex = tierOrder.indexOf(fromTier);
  const toIndex = tierOrder.indexOf(toTier);

  const direction = toIndex > fromIndex ? 'upgrade' : toIndex < fromIndex ? 'downgrade' : 'same';
  const priceDiff = toPlan.pricing.monthlyPriceCents - fromPlan.pricing.monthlyPriceCents;

  const limitChanges: { resource: string; from: number; to: number; improved: boolean }[] = [];
  const limitKeys: (keyof SandboxResourceLimits)[] = [
    'maxSandboxes',
    'maxConcurrent',
    'memoryLimit',
    'storageLimit',
    'apiCallsPerMonth',
    'dailyComputeLimit',
  ];

  for (const key of limitKeys) {
    const fromValue = fromPlan.limits[key];
    const toValue = toPlan.limits[key];
    if (fromValue !== toValue) {
      const improved = toValue === -1 || (fromValue !== -1 && toValue > fromValue);
      limitChanges.push({ resource: key, from: fromValue, to: toValue, improved });
    }
  }

  const featureChanges: { feature: string; gained: boolean }[] = [];
  const featureKeys = Object.keys(TIER_FEATURES.free) as (keyof PlanFeatures)[];

  for (const key of featureKeys) {
    const fromValue = fromPlan.features[key];
    const toValue = toPlan.features[key];
    if (fromValue !== toValue) {
      featureChanges.push({ feature: key, gained: toValue });
    }
  }

  return { direction, priceDiff, limitChanges, featureChanges };
}
