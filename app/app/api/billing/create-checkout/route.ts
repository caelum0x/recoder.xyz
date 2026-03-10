/**
 * Create Checkout Session API
 * Handles creation of checkout sessions for Paddle and DODO Payments
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';
import { resolveDodoApiKey, resolvePaddleAuthCode, resolvePaddleVendorId } from '@/lib/billing-credentials';
import { DodoPaymentsService } from '@/lib/services/dodopayments.service';
import { resolvePublicAppUrl } from '@/lib/email';

const billingRateLimiter = rateLimit(rateLimitConfigs.billing);

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await billingRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan, paymentMethod } = body;

    if (!plan || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing plan or payment method' },
        { status: 400 }
      );
    }

    // Plan configuration
    const planConfig: Record<string, { paddleProductId: string; dodoProductId: string }> = {
      weekly: {
        paddleProductId: process.env.PADDLE_PRODUCT_WEEKLY || 'pro_01jrp8y7mhdrng9hhz2e2ksxs3',
        dodoProductId: process.env.DODO_PRODUCT_WEEKLY || 'prod_weekly',
      },
      monthly: {
        paddleProductId: process.env.PADDLE_PRODUCT_MONTHLY || 'pro_01jrp8zjr8n2pc8ryt4v16qfef',
        dodoProductId: process.env.DODO_PRODUCT_MONTHLY || 'prod_monthly',
      },
      pro: {
        paddleProductId: process.env.PADDLE_PRODUCT_PRO || 'pro_01jrp90dg3hc0tn6xhm3me6bjk',
        dodoProductId: process.env.DODO_PRODUCT_PRO || 'prod_pro',
      },
      enterprise: {
        paddleProductId: process.env.PADDLE_PRODUCT_ENTERPRISE || 'pro_enterprise',
        dodoProductId: process.env.DODO_PRODUCT_ENTERPRISE || 'prod_enterprise',
      },
    };

    const selectedPlan = planConfig[plan];
    if (!selectedPlan) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    const baseUrl = resolvePublicAppUrl();

    if (paymentMethod === 'paddle') {
      // Paddle integration
      const paddleVendorId = resolvePaddleVendorId();
      const paddleAuthCode = resolvePaddleAuthCode();

      if (!paddleVendorId || !paddleAuthCode) {
        logger.warn('Paddle credentials not configured', { route: 'api/billing/create-checkout' });
        return NextResponse.json(
          { error: 'Payment provider not configured. Please contact support.' },
          { status: 503 }
        );
      }

      // Create Paddle checkout
      const paddleResponse = await fetch('https://vendors.paddle.com/api/2.0/product/generate_pay_link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          vendor_id: paddleVendorId,
          vendor_auth_code: paddleAuthCode,
          product_id: selectedPlan.paddleProductId,
          customer_email: user.email,
          passthrough: JSON.stringify({
            userId: user.id,
            plan,
          }),
          return_url: `${baseUrl}/checkout/success?plan=${plan}`,
          webhook_url: `${baseUrl}/api/webhooks/paddle`,
        }),
      });

      const paddleData = await paddleResponse.json();

      if (paddleData.success && paddleData.response?.url) {
        return NextResponse.json({
          success: true,
          checkoutUrl: paddleData.response.url,
          provider: 'paddle',
        });
      } else {
        throw new Error('Failed to create Paddle checkout');
      }
    } else if (paymentMethod === 'dodo') {
      // DODO Payments integration
      const dodoApiKey = resolveDodoApiKey();

      if (!dodoApiKey) {
        logger.warn('DODO Payments credentials not configured', { route: 'api/billing/create-checkout' });
        return NextResponse.json(
          { error: 'Payment provider not configured. Please contact support.' },
          { status: 503 }
        );
      }

      // Create DODO checkout through shared service
      const session = await DodoPaymentsService.createCheckoutSession(
        user.id,
        selectedPlan.dodoProductId,
        undefined,
        `${baseUrl}/checkout/success?plan=${plan}`
      );

      return NextResponse.json({
        success: true,
        checkoutUrl: session.checkoutUrl,
        provider: 'dodo',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('Checkout creation error', { route: 'api/billing/create-checkout', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
