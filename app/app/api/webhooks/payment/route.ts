/**
 * Unified Payment Webhook Endpoint
 *
 * Handles incoming webhooks from whichever payment provider is active
 * (Polar.sh or DodoPayments). The provider is auto-detected from the
 * request headers, or can be forced via the `provider` query param.
 *
 * POST /api/webhooks/payment
 * POST /api/webhooks/payment?provider=polar
 * POST /api/webhooks/payment?provider=dodo
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getPaymentProvider, getPaymentProviderName } from '@/lib/services/payment-providers';
import { PolarPaymentProvider } from '@/lib/services/payment-providers/polar';
import { DodoPaymentProvider } from '@/lib/services/payment-providers/dodo';
import { resolvePolarApiKey, resolveDodoApiKey } from '@/lib/billing-credentials';
import { billingService } from '@/lib/services/billing.service';
import type { WebhookEvent } from '@/lib/services/payment-providers/types';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);

/**
 * Detect which provider sent the webhook based on headers or query param.
 */
function detectProvider(request: NextRequest): 'polar' | 'dodo' | null {
  // Explicit query parameter
  const explicit = request.nextUrl.searchParams.get('provider')?.toLowerCase();
  if (explicit === 'polar' || explicit === 'dodo') return explicit;

  // Header-based detection
  if (request.headers.get('x-polar-signature') || request.headers.get('webhook-id')) {
    return 'polar';
  }
  if (request.headers.get('x-dodo-signature')) {
    return 'dodo';
  }

  // Fall back to active provider
  const active = getPaymentProviderName();
  if (active === 'polar' || active === 'dodo') return active;

  return null;
}

/**
 * Get the appropriate signature from request headers.
 */
function extractSignature(request: NextRequest, provider: 'polar' | 'dodo'): string {
  if (provider === 'polar') {
    return (
      request.headers.get('x-polar-signature') ||
      request.headers.get('webhook-signature') ||
      ''
    );
  }
  return request.headers.get('x-dodo-signature') || '';
}

/**
 * Get or create a provider instance for webhook verification.
 * This may differ from the active checkout provider (e.g. you might receive
 * webhooks from a previously active provider during a migration).
 */
function getProviderForWebhook(providerName: 'polar' | 'dodo') {
  // Try the active provider first
  const active = getPaymentProvider();
  if (active && active.name === providerName) return active;

  // Create a transient instance for verification only
  if (providerName === 'polar') {
    const key = resolvePolarApiKey();
    if (!key) return null;
    return new PolarPaymentProvider(key);
  }

  if (providerName === 'dodo') {
    const key = resolveDodoApiKey();
    if (!key) return null;
    return new DodoPaymentProvider(key);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const providerName = detectProvider(request);
    if (!providerName) {
      logger.warn('Payment webhook received but no provider could be detected', {
        route: 'api/webhooks/payment',
      });
      return NextResponse.json(
        { error: 'No payment provider configured or detected' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    const signature = extractSignature(request, providerName);

    if (!signature) {
      logger.warn('Payment webhook missing signature header', {
        route: 'api/webhooks/payment',
        provider: providerName,
      });
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const provider = getProviderForWebhook(providerName);
    if (!provider) {
      logger.error('Payment provider keys not configured for webhook verification', {
        route: 'api/webhooks/payment',
        provider: providerName,
      });
      return NextResponse.json(
        { error: 'Provider not configured' },
        { status: 500 }
      );
    }

    // Verify signature and parse the event
    const event = await provider.verifyAndParseWebhook(rawBody, signature);
    if (!event) {
      logger.error('Invalid payment webhook signature', {
        route: 'api/webhooks/payment',
        provider: providerName,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    logger.info('Processing payment webhook', {
      route: 'api/webhooks/payment',
      provider: providerName,
      type: event.type,
    });

    // Delegate to the billing service
    await processWebhookEvent(event);

    return NextResponse.json({ success: true, processed: event.type });
  } catch (error) {
    logger.error('Payment webhook error', {
      route: 'api/webhooks/payment',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Process a normalised webhook event through the billing service.
 */
async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  // Forward normalised data to the existing BillingService.handleWebhook
  // which already handles the DB updates, quota changes, and emails.
  const payload = {
    event_type: event.type,
    data: {
      customer_id: event.userId,
      plan_id: event.planId,
      subscription_id: event.subscriptionId,
      amount: event.amount,
      currency: event.currency,
      provider: event.provider,
      interval: 'month', // default; providers will override via raw payload
    },
  };

  await billingService.handleWebhook(event.provider, payload, '__already_verified__');
}
