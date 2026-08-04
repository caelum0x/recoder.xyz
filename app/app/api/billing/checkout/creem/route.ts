/**
 * Creem checkout — session-authed user starts a subscription checkout for a
 * purchasable plan from lib/pricing-config. Degrades to 503 with a truthful
 * reason when Creem env keys are missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { PLANS, type PlanId } from '@/lib/pricing-config';
import { getCreemProvider } from '@/lib/services/creem.service';

function isConfigurationFailure(reason: string): boolean {
  return reason === 'creem_not_configured' || reason.startsWith('creem_product_not_configured');
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const user = authResult.user as { id?: string; email?: string } | undefined;
    if (!user?.id || !user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const planId = body?.planId;
    // Own-property check — `in` walks the prototype chain, so "toString" etc.
    // would pass validation and blow up downstream as a 500 instead of a 400.
    if (typeof planId !== 'string' || !Object.prototype.hasOwnProperty.call(PLANS, planId)) {
      return NextResponse.json(
        { success: false, error: 'Unknown planId' },
        { status: 400 }
      );
    }
    const plan = PLANS[planId as PlanId];
    if (plan.price <= 0) {
      return NextResponse.json(
        { success: false, error: `Plan '${planId}' is not purchasable via checkout` },
        { status: 400 }
      );
    }

    const result = await getCreemProvider().createCheckout({
      userId: user.id,
      email: user.email,
      planId: plan.id,
      amount: plan.price,
      currency: 'USD',
      interval: plan.period,
    });

    // `=== false` (not `!result.ok`): this tsconfig is non-strict, where
    // truthiness checks do not narrow discriminated unions.
    if (result.ok === false) {
      const configuration = isConfigurationFailure(result.reason);
      logger.error('Creem checkout unavailable', {
        route: 'api/billing/checkout/creem',
        reason: result.reason,
      });
      return NextResponse.json(
        {
          success: false,
          error: configuration
            ? 'Creem billing is not configured'
            : 'Creem checkout failed',
          reason: result.reason,
        },
        { status: configuration ? 503 : 502 }
      );
    }

    return NextResponse.json({ success: true, checkoutUrl: result.checkoutUrl, id: result.id });
  } catch (error) {
    logger.error('Failed to create Creem checkout', {
      route: 'api/billing/checkout/creem',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
