/**
 * Canonical subscription plan definitions.
 *
 * Both /api/billing/plans and /api/subscriptions/plans serve data from here
 * so pricing, features, and limits stay consistent across the platform.
 */

export interface PlanDefinition {
  id: string;
  name: string;
  price: number; // in USD (dollars, not cents)
  currency: string;
  interval: string;
  features: string[];
  limits: {
    sessionsPerDay: number;
    tokensPerSession: number;
    requests: number;
    tokens: number;
    workspaces: number;
    connectedAgents: number;
    artifactRetentionDays: number;
    previewDeploysPerMonth: number;
    approvalWorkflows: 'single' | 'shared' | 'advanced' | 'custom';
    governance: 'basic' | 'team' | 'advanced' | 'enterprise';
  };
}

export const SUBSCRIPTION_PLANS: Record<string, PlanDefinition> = {
  'free': {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      'Access to recoder.xyz/dashboard',
      'Access to recoder-code CLI',
      'All AI models',
      'Must provide own OpenRouter API key'
    ],
    limits: {
      sessionsPerDay: 6,
      tokensPerSession: 10000,
      requests: 1000,
      tokens: 1000000,
      workspaces: 1,
      connectedAgents: 1,
      artifactRetentionDays: 7,
      previewDeploysPerMonth: 3,
      approvalWorkflows: 'single',
      governance: 'basic',
    }
  },
  'pro-monthly': {
    id: 'pro-monthly',
    name: 'Pro (Monthly)',
    price: 29,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Free',
      'More Spaces and connected agents',
      'Shared approvals and artifact history',
      'Preview deployment workflows',
      'Priority support',
      'Advanced analytics'
    ],
    limits: {
      sessionsPerDay: 15,
      tokensPerSession: 50000,
      requests: 50000,
      tokens: 50000000,
      workspaces: 10,
      connectedAgents: 5,
      artifactRetentionDays: 30,
      previewDeploysPerMonth: 50,
      approvalWorkflows: 'shared',
      governance: 'team',
    }
  },
  'pro-yearly': {
    id: 'pro-yearly',
    name: 'Pro (Yearly)',
    price: 290,
    currency: 'USD',
    interval: 'year',
    features: [
      'Everything in Pro Monthly',
      'Save 17% ($58/year)',
      'Annual billing'
    ],
    limits: {
      sessionsPerDay: 15,
      tokensPerSession: 50000,
      requests: 50000,
      tokens: 50000000,
      workspaces: 10,
      connectedAgents: 5,
      artifactRetentionDays: 30,
      previewDeploysPerMonth: 50,
      approvalWorkflows: 'shared',
      governance: 'team',
    }
  },
  'enterprise': {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Pro',
      'Advanced governance and retention',
      'Client-safe delivery and approvals',
      'Custom routing and audit controls',
      'SLA guarantee',
      'Custom integrations',
      'Priority support 24/7',
      'High-capacity workflow operations'
    ],
    limits: {
      sessionsPerDay: 999,
      tokensPerSession: 999999,
      requests: 1000000,
      tokens: 1000000000,
      workspaces: 999,
      connectedAgents: 999,
      artifactRetentionDays: 365,
      previewDeploysPerMonth: 999,
      approvalWorkflows: 'custom',
      governance: 'enterprise',
    }
  }
};

/**
 * Look up a plan definition by ID.
 * Supports fuzzy matching: "pro" resolves to "pro-monthly", etc.
 */
export function getPlanById(planId: string): PlanDefinition | undefined {
  if (SUBSCRIPTION_PLANS[planId]) {
    return SUBSCRIPTION_PLANS[planId];
  }
  // Fuzzy match: "pro" -> "pro-monthly", "monthly" -> "pro-monthly"
  const lower = planId.toLowerCase();
  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    if (plan.id.includes(lower) || lower.includes(plan.id)) {
      return plan;
    }
  }
  return undefined;
}
