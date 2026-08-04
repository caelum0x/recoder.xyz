/**
 * Paddle Webhooks Handler
 *
 * Signature verification (HMAC-SHA256 of the raw body, `paddle-signature`
 * header, PADDLE_WEBHOOK_SECRET) + alert normalization live in the
 * PaddleProvider (resolved through the payments registry); subscription
 * state lands through the shared lib/payments/subscription-upsert path
 * (ONE upsert path for all providers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { emitSubscriptionCreated } from '@/lib/analytics';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getProvider } from '@/lib/payments/registry';
import { PADDLE_SIGNATURE_HEADER } from '@/lib/payments/paddle-provider';
import {
  cancelSubscriptionFromEvent,
  recordPaymentOutcomeFromEvent,
  updateSubscriptionFromEvent,
  upsertSubscriptionFromEvent,
} from '@/lib/payments/subscription-upsert';

// This endpoint is reachable unauthenticated (Paddle posts here). Signature
// verification below is the real auth gate; the rate limit only caps flooding
// and webhook-retry storms, matching the creem/dodo webhook siblings.
const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);

const CTX = { provider: 'paddle', route: 'api/paddle/webhooks' };

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.text();
    const signature = request.headers.get(PADDLE_SIGNATURE_HEADER);

    const verified = getProvider('paddle').verifyWebhook(body, signature);
    // `=== false` (not `!verified.ok`): this tsconfig is non-strict, where
    // truthiness checks do not narrow discriminated unions.
    if (verified.ok === false) {
      if (verified.reason === 'paddle_unhandled_event') {
        // Signature was valid; ack alerts we deliberately ignore.
        return NextResponse.json({ success: true });
      }
      if (verified.reason === 'paddle_invalid_payload') {
        return NextResponse.json({
          success: false,
          error: 'webhook_error'
        }, { status: 500 });
      }
      // Missing secret and bad signatures both fail closed, as before.
      return NextResponse.json({
        success: false,
        error: 'invalid_signature'
      }, { status: 401 });
    }

    const event = verified.event;

    switch (event.type) {
      case 'subscription.created':
        await upsertSubscriptionFromEvent(event, CTX);
        if (event.userId) {
          // Conversion event — fired only from this verified webhook,
          // carrying real fields parsed from the payload. Amount/currency are
          // included only when Paddle actually provides them.
          const raw = event.raw as { unit_price?: unknown; currency?: unknown };
          const unitPrice =
            typeof raw.unit_price === 'string' ? parseFloat(raw.unit_price) : undefined;
          emitSubscriptionCreated({
            userId: event.userId,
            planId: event.planId || 'pro',
            priceAmount:
              typeof unitPrice === 'number' && Number.isFinite(unitPrice) ? unitPrice : undefined,
            currency: typeof raw.currency === 'string' ? raw.currency : undefined,
            provider: 'paddle',
          });
        }
        break;

      case 'subscription.updated':
        await updateSubscriptionFromEvent(event, CTX);
        break;

      case 'subscription.canceled':
        await cancelSubscriptionFromEvent(event, CTX);
        break;

      case 'payment.succeeded':
        await recordPaymentOutcomeFromEvent(event, 'active', CTX);
        break;

      case 'payment.failed':
        await recordPaymentOutcomeFromEvent(event, 'failed', CTX);
        break;

      default:
        break;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Paddle webhook error:', error);
    return NextResponse.json({
      success: false,
      error: 'webhook_error'
    }, { status: 500 });
  }
}
