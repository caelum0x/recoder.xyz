/**
 * Creem webhook — raw-body HMAC verify (header `creem-signature`), normalize
 * via the CreemProvider, then land subscription state through the shared
 * lib/payments/subscription-upsert path (ONE upsert path for all providers).
 * All writes are absolute-state upserts/updates so redelivery is idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import {
  CREEM_NOT_CONFIGURED,
  CREEM_SIGNATURE_HEADER,
  getCreemProvider,
} from '@/lib/services/creem.service';
import {
  cancelSubscriptionFromEvent,
  recordPaymentOutcomeFromEvent,
  updateSubscriptionFromEvent,
  upsertSubscriptionFromEvent,
} from '@/lib/payments/subscription-upsert';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);

const CTX = { provider: 'creem', route: 'api/webhooks/creem' };

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const signature = request.headers.get(CREEM_SIGNATURE_HEADER);
    const payload = await request.text();

    const verified = getCreemProvider().verifyWebhook(payload, signature);
    // `=== false` (not `!verified.ok`): this tsconfig is non-strict, where
    // truthiness checks do not narrow discriminated unions.
    if (verified.ok === false) {
      if (verified.reason === CREEM_NOT_CONFIGURED) {
        logger.error('Creem webhook received but Creem is not configured', {
          route: 'api/webhooks/creem',
        });
        return NextResponse.json(
          { error: 'Creem billing not configured', reason: verified.reason },
          { status: 503 }
        );
      }
      if (verified.reason === 'creem_unhandled_event') {
        // Signature was valid; ack so Creem stops redelivering event types we
        // deliberately ignore.
        logger.warn('Ignoring unhandled Creem webhook event', { route: 'api/webhooks/creem' });
        return NextResponse.json({ success: true, processed: null });
      }
      logger.error('Rejected Creem webhook', {
        route: 'api/webhooks/creem',
        reason: verified.reason,
      });
      // A signed-but-unparseable body is a payload problem, not an auth one —
      // label it truthfully.
      if (verified.reason === 'creem_invalid_payload') {
        return NextResponse.json(
          { error: 'Invalid payload', reason: verified.reason },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid signature', reason: verified.reason },
        { status: 401 }
      );
    }

    const event = verified.event;
    logger.info('Processing Creem webhook', { route: 'api/webhooks/creem', type: event.type });

    switch (event.type) {
      case 'subscription.created':
        await upsertSubscriptionFromEvent(event, CTX);
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
    }

    return NextResponse.json({ success: true, processed: event.type });
  } catch (error) {
    logger.error('Creem webhook error', {
      route: 'api/webhooks/creem',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
