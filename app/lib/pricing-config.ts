/**
 * Pricing Configuration for Recoder.xyz
 * 
 * This file defines all pricing tiers, limits, and features
 * Used across the platform for consistency
 */

export type PlanId = 'free' | 'weekly' | 'monthly' | 'pro' | 'enterprise';

export interface PlanLimits {
  sessionsPerDay: number;
  tokensPerSessionPricey: number;
  freeModelsUnlimited: true;
  teamMembers: number;
}

export interface PlanFeatures {
  requiresApiKey: boolean;
  platformProvidesKey: boolean;
  models: string[];
  support: string;
  features: string[];
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  period: 'forever' | 'week' | 'month' | 'year';
  description: string;
  limits: PlanLimits;
  features: PlanFeatures;
  paddle?: {
    productId: string;
    priceId?: string;
  };
  dodo?: {
    productId: string;
  };
}

/**
 * Pricey Models - These have token limits per session
 */
export const PRICEY_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'google/gemini-2.0-flash-exp',
  'google/gemini-pro',
  'openai/gpt-4-turbo',
  'openai/gpt-4',
] as const;

/**
 * Free Models - Unlimited usage across all plans
 */
export const FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-flash-1.5-8b-exp:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'google/gemma-2-9b-it:free',
] as const;

/**
 * Check if a model is considered "pricey" and counts against token limits
 */
export function isPriceyModel(modelId: string): boolean {
  return PRICEY_MODELS.some(model => modelId.includes(model)) ||
         (!modelId.endsWith(':free') && !FREE_MODELS.includes(modelId as any));
}

/**
 * Main Pricing Configuration
 */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Try Recoder with your own API key',
    limits: {
      sessionsPerDay: 6,
      tokensPerSessionPricey: 10000,
      freeModelsUnlimited: true,
      teamMembers: 1,
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['Bring your own OpenRouter key'],
      support: 'Community support',
      features: [
        'Bring your own OpenRouter key',
        'CLI + Web access',
        'Community support',
      ],
    },
  },
  
  weekly: {
    id: 'weekly',
    name: 'Weekly',
    price: 10,
    period: 'week',
    description: 'Perfect for short-term projects',
    limits: {
      sessionsPerDay: 10,
      tokensPerSessionPricey: 30000,
      freeModelsUnlimited: true,
      teamMembers: 3,
    },
    features: {
      requiresApiKey: false,
      platformProvidesKey: true,
      models: ['All AI models (Claude, GPT-4, Gemini)'],
      support: 'Priority support',
      features: [
        'No API key needed - we provide it',
        'All AI models (Claude, GPT-4, Gemini)',
        'Priority support',
        'Team collaboration (3 members)',
        'Advanced features',
      ],
    },
    paddle: {
      productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_WEEKLY || 'prod_weekly_temp',
    },
    dodo: {
      productId: process.env.NEXT_PUBLIC_DODO_PRODUCT_WEEKLY || 'dodo_weekly_temp',
    },
  },
  
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    price: 20,
    period: 'month',
    description: 'Best for individual developers',
    limits: {
      sessionsPerDay: 15,
      tokensPerSessionPricey: 50000,
      freeModelsUnlimited: true,
      teamMembers: 5,
    },
    features: {
      requiresApiKey: false,
      platformProvidesKey: true,
      models: ['All AI models (Claude, GPT-4, Gemini)'],
      support: 'Priority support',
      features: [
        'No API key needed - we provide it',
        'All AI models (Claude, GPT-4, Gemini)',
        'Priority support',
        'Team collaboration (5 members)',
        'Advanced features',
        'API access',
      ],
    },
    paddle: {
      productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_MONTHLY || 'prod_monthly_temp',
    },
    dodo: {
      productId: process.env.NEXT_PUBLIC_DODO_PRODUCT_MONTHLY || 'dodo_monthly_temp',
    },
  },
  
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 100,
    period: 'month',
    description: 'For power users and teams',
    limits: {
      sessionsPerDay: 20,
      tokensPerSessionPricey: 100000,
      freeModelsUnlimited: true,
      teamMembers: 10,
    },
    features: {
      requiresApiKey: false,
      platformProvidesKey: true,
      models: ['All AI models + Beta access'],
      support: 'Priority support + Slack',
      features: [
        'No API key needed - we provide it',
        'All AI models + Beta access',
        'Priority support + Slack',
        'Team collaboration (10 members)',
        'Advanced features',
        'API access',
        'Custom AI models',
        'Dedicated account manager',
      ],
    },
    paddle: {
      productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_PRO || 'prod_pro_temp',
    },
    dodo: {
      productId: process.env.NEXT_PUBLIC_DODO_PRODUCT_PRO || 'dodo_pro_temp',
    },
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // Custom pricing
    period: 'month',
    description: 'Custom solutions for large teams',
    limits: {
      sessionsPerDay: 999,
      tokensPerSessionPricey: 999999,
      freeModelsUnlimited: true,
      teamMembers: 999,
    },
    features: {
      requiresApiKey: false,
      platformProvidesKey: true,
      models: ['All AI models + Custom models'],
      support: 'Dedicated support + SLA',
      features: [
        'Unlimited everything',
        'Custom AI models',
        'On-premise deployment',
        'SLA guarantees',
        'Security audit',
        'Dedicated support',
        'Custom integrations',
        'Training & onboarding',
      ],
    },
  },
};

/**
 * Get plan by ID
 */
export function getPlan(planId: PlanId): Plan {
  return PLANS[planId];
}

/**
 * Get plan limits
 */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId].limits;
}

/**
 * Check if user can start a new session
 */
export function canStartSession(planId: PlanId, sessionsUsedToday: number): boolean {
  const limits = getPlanLimits(planId);
  return sessionsUsedToday < limits.sessionsPerDay;
}

/**
 * Check if user can use tokens in current session
 */
export function canUseTokens(
  planId: PlanId,
  sessionTokensUsed: number,
  tokensToUse: number,
  modelId: string
): { allowed: boolean; reason?: string } {
  // Free models always allowed
  if (!isPriceyModel(modelId)) {
    return { allowed: true };
  }
  
  const limits = getPlanLimits(planId);
  const wouldExceed = sessionTokensUsed + tokensToUse > limits.tokensPerSessionPricey;
  
  if (wouldExceed) {
    return {
      allowed: false,
      reason: `Session token limit reached (${limits.tokensPerSessionPricey} tokens). Use free models or upgrade your plan.`,
    };
  }
  
  return { allowed: true };
}

/**
 * Format price for display
 */
export function formatPrice(plan: Plan): string {
  if (plan.price === 0) {
    return 'Free';
  }
  return `$${plan.price}/${plan.period}`;
}

/**
 * Get upgrade URL for plan
 */
export function getUpgradeUrl(planId: PlanId): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
  return `${baseUrl}/pricing?upgrade=${planId}`;
}

/**
 * Calculate next plan upgrade
 */
export function getNextPlan(currentPlan: PlanId): PlanId | null {
  const upgradePath: Record<PlanId, PlanId | null> = {
    free: 'weekly',
    weekly: 'monthly',
    monthly: 'pro',
    pro: 'enterprise',
    enterprise: null,
  };
  
  return upgradePath[currentPlan];
}

/**
 * Get user-friendly limit descriptions
 */
export function getLimitDescription(planId: PlanId): string {
  const limits = getPlanLimits(planId);
  
  return `${limits.sessionsPerDay} sessions/day with ${(limits.tokensPerSessionPricey / 1000).toFixed(0)}k tokens per session for premium models. Free models have unlimited usage.`;
}

/**
 * Export for use in other modules
 */
export default PLANS;
