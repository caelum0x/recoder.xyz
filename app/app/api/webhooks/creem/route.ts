/**
 * Creem webhook — raw-body HMAC verify (header `creem-signature`), normalize
 * via the CreemProvider, then upsert the subscriptions row and mirror
 * users.subscriptionPlan/subscriptionStatus (same mirror fields as the Dodo
 * flow). All writes are absolute-state upserts/updates so redelivery is
 * idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import {
  CREEM_NOT_CONFIGURED,
  CREEM_SIGNATURE_HEADER,
  getCreemProvider,
} from '@/lib/services/creem.service';
import type { NormalizedWebhookEvent } from '@/lib/payments/provider';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);

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
        await handleSubscriptionCreated(event);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(event);
        break;
      case 'payment.succeeded':
        await handlePaymentOutcome(event, 'active');
        break;
      case 'payment.failed':
        await handlePaymentOutcome(event, 'failed');
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

/**
 * Checkout metadata round-trips amount/interval — read the NORMALIZER's
 * envelope-agnostic extraction, never re-walk `raw` (an `object` vs `data`
 * envelope divergence here silently dropped fields).
 */
function metadataOf(event: NormalizedWebhookEvent): Record<string, unknown> {
  return event.metadata ?? {};
}

async function handleSubscriptionCreated(event: NormalizedWebhookEvent) {
  if (!event.userId) {
    // Without our metadata.userId there is nothing to attach the subscription
    // to. Ack (stop redelivery) but say so truthfully.
    logger.error('Creem subscription.created without metadata.userId', {
      route: 'api/webhooks/creem',
      subscriptionId: event.subscriptionId,
    });
    return;
  }

  const metadata = metadataOf(event);
  const amount = typeof metadata.amount === 'number' ? metadata.amount : undefined;
  const currency = typeof metadata.currency === 'string' ? metadata.currency : undefined;
  const interval = typeof metadata.interval === 'string' ? metadata.interval : undefined;
  const status = event.status ?? 'active';
  const planId = event.planId ?? 'unknown';

  // userId is unique on subscriptions, so redelivery lands on the same row.
  await prisma.subscriptions.upsert({
    where: { userId: event.userId },
    update: {
      status,
      provider: 'creem',
      providerId: event.subscriptionId,
      planId,
      amount,
      currency,
      interval,
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      userId: event.userId,
      status,
      provider: 'creem',
      providerId: event.subscriptionId,
      planId,
      amount,
      currency: currency ?? 'USD',
      interval,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  });

  await prisma.users.update({
    where: { id: event.userId },
    data: {
      subscriptionPlan: event.planId,
      subscriptionStatus: status,
      subscriptionId: event.subscriptionId,
    },
  });

  logger.info('Creem subscription created', {
    route: 'api/webhooks/creem',
    userId: event.userId,
    planId: event.planId,
  });
}

async function findByProviderId(providerId: string) {
  return prisma.subscriptions.findFirst({ where: { providerId } });
}

async function handleSubscriptionUpdated(event: NormalizedWebhookEvent) {
  const subscription = await findByProviderId(event.subscriptionId);
  if (!subscription) {
    // Out-of-order delivery (update before create): fall back to the created
    // path when the payload carries our userId, otherwise log and ack.
    if (event.userId) {
      await handleSubscriptionCreated(event);
      return;
    }
    logger.warn('Creem subscription.updated for unknown subscription', {
      route: 'api/webhooks/creem',
      subscriptionId: event.subscriptionId,
    });
    return;
  }

  await prisma.subscriptions.update({
    where: { id: subscription.id },
    data: {
      ...(event.status ? { status: event.status } : {}),
      ...(event.planId ? { planId: event.planId } : {}),
      updatedAt: new Date(),
    },
  });

  await prisma.users.update({
    where: { id: subscription.userId },
    data: {
      ...(event.planId ? { subscriptionPlan: event.planId } : {}),
      ...(event.status ? { subscriptionStatus: event.status } : {}),
    },
  });

  logger.info('Creem subscription updated', {
    route: 'api/webhooks/creem',
    userId: subscription.userId,
    planId: event.planId,
  });
}

async function handleSubscriptionCanceled(event: NormalizedWebhookEvent) {
  const subscription = await findByProviderId(event.subscriptionId);
  if (!subscription) {
    logger.warn('Creem cancel for unknown subscription', {
      route: 'api/webhooks/creem',
      subscriptionId: event.subscriptionId,
    });
    return;
  }

  await prisma.subscriptions.update({
    where: { id: subscription.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.users.update({
    where: { id: subscription.userId },
    data: { subscriptionStatus: 'cancelled' },
  });

  logger.info('Creem subscription cancelled', {
    route: 'api/webhooks/creem',
    userId: subscription.userId,
  });
}

async function handlePaymentOutcome(
  event: NormalizedWebhookEvent,
  paymentStatus: 'active' | 'failed'
) {
  const userId = event.userId ?? (await findByProviderId(event.subscriptionId))?.userId;
  if (!userId) {
    logger.warn('Creem payment event for unknown subscription', {
      route: 'api/webhooks/creem',
      subscriptionId: event.subscriptionId,
    });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      paymentStatus,
      ...(paymentStatus === 'active' ? { lastPaymentDate: new Date() } : {}),
    },
  });

  logger.info('Creem payment outcome recorded', {
    route: 'api/webhooks/creem',
    userId,
    paymentStatus,
  });
}
