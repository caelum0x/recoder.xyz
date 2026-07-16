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
      'Access to web.recoder.xyz',
      'Access to recoder-code CLI',
      'All AI models',
      'Must provide own OpenRouter API key'
    ],
    limits: {
      sessionsPerDay: 6,
      tokensPerSession: 10000,
      requests: 1000,
      tokens: 1000000
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
      'Platform API keys (no key needed)',
      'Priority support',
      'Advanced analytics',
      '50x more usage'
    ],
    limits: {
      sessionsPerDay: 50,
      tokensPerSession: 100000,
      requests: 50000,
      tokens: 50000000
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
      sessionsPerDay: 50,
      tokensPerSession: 100000,
      requests: 50000,
      tokens: 50000000
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
      'Dedicated API keys',
      'White-label options',
      'SLA guarantee',
      'Custom integrations',
      'Priority support 24/7',
      '1M requests/month'
    ],
    limits: {
      sessionsPerDay: 1000,
      tokensPerSession: 500000,
      requests: 1000000,
      tokens: 1000000000
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
