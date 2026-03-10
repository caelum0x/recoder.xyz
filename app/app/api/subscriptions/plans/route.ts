/**
 * Subscription Plans API Route
 *
 * Returns available subscription plans from the canonical plan definitions.
 * This route exists for backward compatibility with the backend-api client
 * which calls /api/subscriptions/plans. The canonical source is
 * /api/billing/plans — both routes serve the same data.
 */

import { NextResponse } from 'next/server';
import { SUBSCRIPTION_PLANS } from '@/lib/config/subscription-plans';

export async function GET() {
  const plans = Object.values(SUBSCRIPTION_PLANS);

  return NextResponse.json({
    success: true,
    plans,
  });
}
