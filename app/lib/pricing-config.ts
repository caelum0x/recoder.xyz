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
  workspaces: number;
  connectedAgents: number;
  artifactRetentionDays: number;
  previewDeploysPerMonth: number;
  approvalWorkflows: 'single' | 'shared' | 'advanced' | 'custom';
  governance: 'basic' | 'team' | 'advanced' | 'enterprise';
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
    description: 'BYOK workspace for proving the first agent-work loop',
    limits: {
      sessionsPerDay: 6,
      tokensPerSessionPricey: 10000,
      freeModelsUnlimited: true,
      teamMembers: 1,
      workspaces: 1,
      connectedAgents: 1,
      artifactRetentionDays: 7,
      previewDeploysPerMonth: 3,
      approvalWorkflows: 'single',
      governance: 'basic',
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['Bring your own provider keys'],
      support: 'Community support',
      features: [
        'Bring your own provider keys',
        '1 workspace for initial validation',
        'Connected runtime and preview lane',
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
    description: 'BYOK workspace for short shipping cycles',
    limits: {
      sessionsPerDay: 10,
      tokensPerSessionPricey: 30000,
      freeModelsUnlimited: true,
      teamMembers: 3,
      workspaces: 3,
      connectedAgents: 3,
      artifactRetentionDays: 14,
      previewDeploysPerMonth: 15,
      approvalWorkflows: 'shared',
      governance: 'team',
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['Bring your own provider keys'],
      support: 'Priority support',
      features: [
        'Bring your own provider keys',
        'Up to 3 connected builder seats',
        'Shared run history and artifacts',
        'Task + preview workflow',
        'Priority support',
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
    description: 'BYOK team workspace with shared approvals',
    limits: {
      sessionsPerDay: 15,
      tokensPerSessionPricey: 50000,
      freeModelsUnlimited: true,
      teamMembers: 5,
      workspaces: 10,
      connectedAgents: 5,
      artifactRetentionDays: 30,
      previewDeploysPerMonth: 50,
      approvalWorkflows: 'shared',
      governance: 'team',
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['Bring your own provider keys'],
      support: 'Priority support',
      features: [
        'Bring your own provider keys',
        'Up to 5 connected builder seats',
        'Shared approvals and handoff',
        'Longer artifact retention',
        'Priority support',
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
    description: 'Control plane for active agent teams',
    limits: {
      sessionsPerDay: 20,
      tokensPerSessionPricey: 100000,
      freeModelsUnlimited: true,
      teamMembers: 10,
      workspaces: 25,
      connectedAgents: 10,
      artifactRetentionDays: 90,
      previewDeploysPerMonth: 150,
      approvalWorkflows: 'advanced',
      governance: 'advanced',
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['Bring your own provider keys'],
      support: 'Priority support + Slack',
      features: [
        'Bring your own provider keys',
        'Up to 10 connected builder seats',
        'Admin controls and audit trails',
        'Priority workflow support',
        'Priority support + Slack',
        'API access',
        'Custom integrations',
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
    description: 'Custom governance for large agent teams',
    limits: {
      sessionsPerDay: 999,
      tokensPerSessionPricey: 999999,
      freeModelsUnlimited: true,
      teamMembers: 999,
      workspaces: 999,
      connectedAgents: 999,
      artifactRetentionDays: 365,
      previewDeploysPerMonth: 999,
      approvalWorkflows: 'custom',
      governance: 'enterprise',
    },
    features: {
      requiresApiKey: true,
      platformProvidesKey: false,
      models: ['BYOK or custom model routing'],
      support: 'Dedicated support + SLA',
      features: [
        'Custom agent capacity',
        'BYOK or custom model routing',
        'On-premise deployment',
        'Approvals, audit, and retention controls',
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
  const workspaceLabel = limits.workspaces >= 999 ? 'unlimited workspaces' : `${limits.workspaces} workspace${limits.workspaces === 1 ? '' : 's'}`;
  const agentLabel = limits.connectedAgents >= 999 ? 'unlimited connected agents' : `${limits.connectedAgents} connected agent${limits.connectedAgents === 1 ? '' : 's'}`;
  const previewLabel = limits.previewDeploysPerMonth >= 999 ? 'unlimited preview deploys' : `${limits.previewDeploysPerMonth} preview deploys/month`;

  return `${workspaceLabel}, ${agentLabel}, ${previewLabel}, and ${limits.artifactRetentionDays} days of artifact history.`;
}

/**
 * Export for use in other modules
 */
export default PLANS;
