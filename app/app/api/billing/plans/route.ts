/**
 * Billing Plans API Route
 * Returns available subscription plans from the canonical plan definitions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SUBSCRIPTION_PLANS } from '@/lib/config/subscription-plans';
import { logger } from '@/lib/logger';

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
