/**
 * Billing Plans API Route
 * Returns available subscription plans (standalone implementation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Plan configuration matching the subscription service
// Note: Not exported because route files can only export HTTP handlers
const SUBSCRIPTION_PLANS = {
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

export async function GET(request: NextRequest) {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS);

    return NextResponse.json({
      success: true,
      plans: plans  // Return plans at top level for easier access
    });
  } catch (error) {
    logger.error('Failed to get plans', { route: 'api/billing/plans', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get plans'
      },
      { status: 500 }
    );
  }
}
