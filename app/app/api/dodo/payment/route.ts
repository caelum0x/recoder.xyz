/**
 * Dodo Pay Payment API
 * Creates checkout sessions via the real Dodo Payments SDK
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { DodoPaymentsService } from '@/lib/services/dodopayments.service';
import { logger } from '@/lib/logger';
import { resolveDodoApiKey } from '@/lib/billing-credentials';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user?.id) {
      return NextResponse.json({
        success: false,
        error: 'unauthorized'
      }, { status: 401 });
    }

    const body = await request.json();
    const { plan, returnUrl } = body;

    if (!plan) {
      return NextResponse.json({
        success: false,
        error: 'Plan is required',
      }, { status: 400 });
    }

    // Map plan names to Dodo product IDs
    const planProductMap: Record<string, string> = {
      weekly: process.env.DODO_PRODUCT_WEEKLY || 'prod_weekly',
      monthly: process.env.DODO_PRODUCT_MONTHLY || 'prod_monthly',
      pro: process.env.DODO_PRODUCT_PRO || 'prod_pro',
      enterprise: process.env.DODO_PRODUCT_ENTERPRISE || 'prod_enterprise',
    };

    const productId = planProductMap[plan.toLowerCase()];
    if (!productId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid plan. Must be one of: weekly, monthly, pro, enterprise',
      }, { status: 400 });
    }

    if (!resolveDodoApiKey()) {
      return NextResponse.json({
        success: false,
        error: 'Payment provider not configured. Please contact support.',
      }, { status: 503 });
    }

    const session = await DodoPaymentsService.createCheckoutSession(
      user.id,
      productId,
      undefined, // no trial days
      returnUrl
    );

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
        provider: 'dodo',
      },
    });
  } catch (error) {
    logger.error('Dodo Pay error', { route: 'api/dodo/payment', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'Failed to create payment session',
    }, { status: 500 });
  }
}
