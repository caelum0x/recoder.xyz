/**
 * Subscription Plan Configuration
 * Session-based tracking system for Recoder.xyz
 */

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  sessionsPerDay: number; // Number of sessions allowed per day
  requiresOwnApiKey: boolean; // Whether user must provide OpenRouter API key
  features: string[];
  premiumModels: boolean; // Access to premium models (Claude, Gemini Pro)
  premiumModelsTokenLimit: number; // Daily token limit for premium models, -1 for unlimited
  freeModelsUnlimited: boolean; // Unlimited access to free models
  prioritySupport: boolean;
  priorityRouting: boolean;
  analyticsRetention: number; // days
  monthlyRequests: number; // Legacy field for compatibility
  tokensPerMonth: number; // Legacy field for compatibility
}

// Premium models that have token limits
export const PREMIUM_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-sonnet-4.5',
  'google/gemini-2.0-flash-exp',
  'google/gemini-pro',
  'google/gemini-2.5-pro',
  'openai/gpt-4-turbo',
  'openai/gpt-4'
];

// Free models available to all users
export const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'google/gemini-flash-1.5',
  'anthropic/claude-3-haiku',
  'openai/gpt-3.5-turbo',
  'mistralai/mistral-7b-instruct',
  'mistralai/mixtral-8x7b-instruct'
];

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    sessionsPerDay: 6, // 6 sessions per day
    requiresOwnApiKey: true, // Must provide OpenRouter API key
    features: [
      'cli_access',
      'web_interface',
      'basic_generation',
      'free_models_unlimited',
      'community_support'
    ],
    premiumModels: false, // Cannot use Claude, Gemini Pro, etc.
    premiumModelsTokenLimit: 0,
    freeModelsUnlimited: true, // Can use free models unlimited within sessions
    prioritySupport: false,
    priorityRouting: false,
    analyticsRetention: 7, // 7 days
    monthlyRequests: 180, // Legacy: 6 sessions * 30 days
    tokensPerMonth: 300000 // Legacy
  },
  
  pro: {
    sessionsPerDay: 6, // 6 sessions per day
    requiresOwnApiKey: true, // BYOK-only beta: all users must provide own keys
    features: [
      'cli_access',
      'web_interface',
      'advanced_generation',
      'premium_models',
      'free_models_unlimited',
      'priority_support',
      'analytics_dashboard',
      'code_export',
      'collaboration'
    ],
    premiumModels: true, // Can use Claude 3.5 Sonnet, Gemini 2.0 Flash exp
    premiumModelsTokenLimit: 100000, // 100K tokens/day for premium models
    freeModelsUnlimited: true,
    prioritySupport: true,
    priorityRouting: true,
    analyticsRetention: 90, // 90 days
    monthlyRequests: 180, // Legacy: 6 sessions * 30 days
    tokensPerMonth: 3000000 // Legacy
  },
  
  enterprise: {
    sessionsPerDay: 20, // 20 sessions per day
    requiresOwnApiKey: true, // BYOK-only beta: all users must provide own keys
    features: [
      'everything',
      'unlimited_sessions',
      'unlimited_premium_tokens',
      'custom_models',
      'dedicated_support',
      'sla_guarantee',
      'advanced_security',
      'audit_logs',
      'sso',
      'priority_routing',
      'custom_integrations',
      'white_label'
    ],
    premiumModels: true,
    premiumModelsTokenLimit: 500000, // 500K tokens/day for premium models
    freeModelsUnlimited: true,
    prioritySupport: true,
    priorityRouting: true,
    analyticsRetention: 365, // 1 year
    monthlyRequests: 600, // Legacy: 20 sessions * 30 days
    tokensPerMonth: 15000000 // Legacy
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
 * Check if a model is premium
 */
export function isPremiumModel(model: string): boolean {
  return PREMIUM_MODELS.some(pm => model.includes(pm) || pm.includes(model));
}

/**
 * Check if user can start a new session based on their plan
 */
export function canStartSession(
  plan: string,
  sessionsToday: number
): {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
} {
  const limits = getPlanLimits(plan);
  
  // Check daily session limit
  if (sessionsToday >= limits.sessionsPerDay) {
    return {
      allowed: false,
      reason: `Daily session limit of ${limits.sessionsPerDay} reached. Reset at midnight.`,
      upgradeRequired: true
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can use a specific model
 */
export function canUseModel(
  plan: string,
  model: string,
  tokensUsedToday: number
): {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
} {
  const limits = getPlanLimits(plan);
  const isModelPremium = isPremiumModel(model);
  
  // Premium model check
  if (isModelPremium && !limits.premiumModels) {
    return {
      allowed: false,
      reason: `${model} requires PRO or Enterprise plan`,
      upgradeRequired: true
    };
  }
  
  // Token limit check for premium models
  if (isModelPremium && limits.premiumModelsTokenLimit > 0) {
    if (tokensUsedToday >= limits.premiumModelsTokenLimit) {
      return {
        allowed: false,
        reason: `Daily premium model token limit of ${limits.premiumModelsTokenLimit} reached. Free models still available.`,
        upgradeRequired: false
      };
    }
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
    billingCycle: 'monthly',
    features: [
      '6 sessions per day',
      'Free models unlimited',
      'OpenRouter API key required',
      'Community support'
    ]
  },
  pro: {
    monthly: 20, // $20/month
    yearly: 200, // $16.67/month (~17% discount)
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      '6 sessions per day',
      'Premium models included',
      '100K tokens/day for premium models',
      'Free models unlimited',
      'BYOK: Bring your own API key',
      'Priority support',
      'Code export',
      'Analytics dashboard'
    ]
  },
  enterprise: {
    monthly: 79, // $79/month
    yearly: 790, // $65.83/month (~17% discount)
    currency: 'USD',
    billingCycle: 'monthly',
    custom: false,
    features: [
      '20 sessions per day',
      'Premium models included',
      '500K tokens/day for premium models',
      'Free models unlimited',
      'BYOK: Bring your own API key',
      'Dedicated support',
      'SLA guarantee',
      'Advanced security',
      'Custom integrations',
      'Priority routing'
    ]
  }
};

export default {
  PLAN_LIMITS,
  PLAN_PRICING,
  PREMIUM_MODELS,
  FREE_MODELS,
  getPlanLimits,
  hasFeature,
  isPremiumModel,
  canStartSession,
  canUseModel
};

