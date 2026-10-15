/**
 * Create Checkout Session API
 * Handles creation of hosted checkout sessions. Dodo is the Merchant of Record
 * (tried first by every client surface); Paddle remains a configured fallback.
 * Creem is retired for NEW checkout creation (owner directive 2026-10-16 — see
 * the `paymentMethod === 'creem'` branch below) and always fails closed with a
 * 503, regardless of whether CREEM_API_KEY is still set in the environment.
 * Provider selection itself comes from the client's `paymentMethod` body
 * field, not from an order encoded here.
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

    // Plan configuration. `creemProductId` is the Creem hosted-product id per plan.
    const planConfig: Record<string, { paddleProductId: string; dodoProductId: string; creemProductId: string }> = {
      weekly: {
        paddleProductId: process.env.PADDLE_PRODUCT_WEEKLY || 'pro_01jrp8y7mhdrng9hhz2e2ksxs3',
        dodoProductId: process.env.DODO_PRODUCT_WEEKLY || 'prod_weekly',
        creemProductId: process.env.CREEM_PRODUCT_WEEKLY || '',
      },
      monthly: {
        paddleProductId: process.env.PADDLE_PRODUCT_MONTHLY || 'pro_01jrp8zjr8n2pc8ryt4v16qfef',
        dodoProductId: process.env.DODO_PRODUCT_MONTHLY || 'prod_monthly',
        creemProductId: process.env.CREEM_PRODUCT_MONTHLY || '',
      },
      pro: {
        paddleProductId: process.env.PADDLE_PRODUCT_PRO || 'pro_01jrp90dg3hc0tn6xhm3me6bjk',
        dodoProductId: process.env.DODO_PRODUCT_PRO || 'prod_pro',
        creemProductId: process.env.CREEM_PRODUCT_PRO || '',
      },
      // Pro billed yearly ($290/yr — pricing-config.ts 'pro-annual', 2 months
      // free vs. $29/mo x 12). Previously missing from this record, so the
      // annual plan on the pricing page could not actually be checked out
      // (planConfig[plan] was undefined -> 400 "Invalid plan").
      'pro-annual': {
        paddleProductId: process.env.PADDLE_PRODUCT_PRO_ANNUAL || 'pro_annual',
        dodoProductId: process.env.DODO_PRODUCT_PRO_ANNUAL || 'prod_pro_annual',
        creemProductId: process.env.CREEM_PRODUCT_PRO_ANNUAL || '',
      },
      team: {
        paddleProductId: process.env.PADDLE_PRODUCT_TEAM || 'pro_team',
        dodoProductId: process.env.DODO_PRODUCT_TEAM || 'prod_team',
        creemProductId: process.env.CREEM_PRODUCT_TEAM || '',
      },
      enterprise: {
        paddleProductId: process.env.PADDLE_PRODUCT_ENTERPRISE || 'pro_enterprise',
        dodoProductId: process.env.DODO_PRODUCT_ENTERPRISE || 'prod_enterprise',
        creemProductId: process.env.CREEM_PRODUCT_ENTERPRISE || '',
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

    if (paymentMethod === 'creem') {
      // Creem is retired for NEW checkout sessions (owner directive 2026-10-16:
      // Dodo is the only provider going forward; the Creem API key/webhook
      // secret shared in chat has an unconfirmed rotation status). Fail closed
      // without ever calling api.creem.io, even if CREEM_API_KEY is still set
      // in the environment — a new customer must never be sent to Creem.
      // The Creem webhook handler (api/webhooks/creem) is intentionally left
      // untouched so any pre-existing Creem subscriber's billing events still
      // reconcile; this only blocks *new* checkout creation.
      logger.warn('Creem checkout creation blocked (retired for new subscriptions)', {
        route: 'api/billing/create-checkout',
        plan,
      });
      return NextResponse.json(
        { error: 'Creem checkout is no longer offered for new subscriptions. Please use Dodo Payments.' },
        { status: 503 },
      );
    } else if (paymentMethod === 'paddle') {
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
