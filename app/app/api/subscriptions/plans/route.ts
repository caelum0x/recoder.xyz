import { NextResponse } from 'next/server';

export async function GET() {
  // Hardcoded subscription plans matching the backend
  const plans = {
    success: true,
    plans: [
      {
        id: 'weekly',
        name: 'Weekly Pro',
        price: 1000, // $10.00 in cents
        interval: 'week',
        intervalCount: 1,
        features: [
          '10 sessions per day',
          '30k tokens/session',
          'All AI models',
          'Priority support',
          'Team collaboration (3 members)',
        ],
      },
      {
        id: 'monthly',
        name: 'Monthly Pro',
        price: 2000, // $20.00 in cents
        interval: 'month',
        intervalCount: 1,
        features: [
          '15 sessions per day',
          '50k tokens/session',
          'All AI models',
          'Priority support',
          'Team collaboration (5 members)',
          'API access',
        ],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 10000, // $100.00 in cents
        interval: 'month',
        intervalCount: 1,
        features: [
          '20 sessions per day',
          '100k tokens/session',
          'All AI models + Beta access',
          'Priority support + Slack',
          'Team collaboration (10 members)',
          'API access',
          'Custom AI models',
          'Dedicated account manager',
        ],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 50000, // $500.00 in cents
        interval: 'month',
        intervalCount: 1,
        features: [
          'Unlimited sessions',
          'Unlimited tokens',
          'All AI models + Beta access',
          '24/7 dedicated support',
          'Unlimited team members',
          'API access',
          'Custom AI models',
          'On-premise deployment',
          'SLA guarantees',
        ],
      },
    ],
  };

  return NextResponse.json(plans);
}
