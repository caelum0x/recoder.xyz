/**
 * Dodo webhook — signature verification + event normalization live in the
 * DodoProvider (resolved through the payments registry), and subscription
 * state lands through the shared lib/payments/subscription-upsert path
 * (ONE upsert path for all providers). Dodo-specific side effects
 * (legacy users.plan mirror, audit logs, emails, conversion analytics)
 * stay here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from '@/lib/email';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { emitSubscriptionCreated } from '@/lib/analytics';
import { getProvider } from '@/lib/payments/registry';
import {
  DODO_ID_HEADER,
  DODO_NOT_CONFIGURED,
  DODO_SIGNATURE_HEADER,
  DODO_TIMESTAMP_HEADER,
} from '@/lib/payments/dodo-provider';
import {
  cancelSubscriptionFromEvent,
  updateSubscriptionFromEvent,
  upsertSubscriptionFromEvent,
} from '@/lib/payments/subscription-upsert';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);

const CTX = { provider: 'dodo', route: 'api/webhooks/dodo' };

/**
 * Resolve our internal users.id from a raw Dodo webhook `data` object.
 * Real Dodo payloads carry no top-level `user_id` — it round-trips only
 * through `data.metadata.userId`, which `DodoPaymentsService.createCheckoutSession`
 * stamps at checkout time. `data.user_id` is kept as a harmless legacy
 * fallback only (never actually sent by Dodo).
 */
function resolveDodoUserId(data: Record<string, unknown>): string | undefined {
  const metadata =
    typeof data.metadata === 'object' && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : {};
  const userId = metadata.userId ?? data.user_id;
  return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const signature = request.headers.get(DODO_SIGNATURE_HEADER);
    const webhookId = request.headers.get(DODO_ID_HEADER);
    const webhookTimestamp = request.headers.get(DODO_TIMESTAMP_HEADER);
    const payload = await request.text();

    const verified = getProvider('dodo').verifyWebhook(payload, signature, {
      id: webhookId,
      timestamp: webhookTimestamp,
    });
    // `=== false` (not `!verified.ok`): this tsconfig is non-strict, where
    // truthiness checks do not narrow discriminated unions.
    if (verified.ok === false) {
      if (verified.reason === DODO_NOT_CONFIGURED) {
        logger.error('Dodo webhook received but Dodo is not configured', {
          route: 'api/webhooks/dodo',
        });
        return NextResponse.json(
          { error: 'Dodo billing not configured', reason: verified.reason },
          { status: 503 }
        );
      }
      if (verified.reason === 'dodo_invalid_payload') {
        return NextResponse.json(
          { error: 'Invalid payload', reason: verified.reason },
          { status: 400 }
        );
      }
      if (verified.reason === 'dodo_unhandled_event') {
        // Signature was valid; refunds keep their audit trail, everything
        // else is acked so Dodo stops redelivering.
        const parsed = JSON.parse(payload) as { type?: string; data?: Record<string, unknown> };
        if (parsed.type === 'refund.created') {
          await handleRefundCreated(parsed.data ?? {});
          return NextResponse.json({ success: true, processed: 'refund.created' });
        }
        logger.warn('Unhandled DODO webhook type', {
          route: 'api/webhooks/dodo',
          type: parsed.type,
        });
        return NextResponse.json({ success: true, processed: null });
      }
      logger.error('Invalid DODO webhook signature', { route: 'api/webhooks/dodo' });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = verified.event;
    const raw = event.raw as { type?: string; data?: Record<string, unknown> };
    const rawType = raw.type ?? event.type;
    const data: any = raw.data ?? {};

    logger.info('Processing DODO webhook', { route: 'api/webhooks/dodo', type: rawType });

    // Shared subscription-table path (same helper as the Creem webhook).
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
    }

    // Dodo-specific side effects, keyed on the raw provider event type.
    switch (rawType) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(data);
        break;

      case 'payment.failed':
        await handlePaymentFailed(data);
        break;

      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(data);
        break;

      case 'subscription.renewed':
        await handleSubscriptionRenewed(data);
        break;

      default:
        break;
    }

    return NextResponse.json({ success: true, processed: rawType });

  } catch (error) {
    logger.error('DODO webhook error', { route: 'api/webhooks/dodo', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentSucceeded(data: any) {
  const { amount, currency, transaction_id, subscription_id } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('payment.succeeded with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      transaction_id,
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      lastPaymentDate: new Date(),
      lastPaymentAmount: amount,
      paymentStatus: 'active'
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'payment_succeeded',
      resource: 'billing',
      metadata: { amount, currency, transaction_id, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Payment succeeded', { route: 'api/webhooks/dodo', userId: user_id, amount, currency });
}

async function handlePaymentFailed(data: any) {
  const { amount, reason, subscription_id, next_retry_date } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('payment.failed with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      paymentStatus: 'failed'
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'payment_failed',
      resource: 'billing',
      metadata: { amount, reason, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  // Send payment failed email to the user
  try {
    const user = await prisma.users.findUnique({
      where: { id: user_id },
      select: { email: true, name: true, plan: true }
    });
    if (user?.email) {
      const retryDate = next_retry_date
        ? new Date(next_retry_date * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined;
      await sendPaymentFailedEmail(
        user.email,
        user.name || 'there',
        user.plan || 'Pro',
        retryDate
      );
    }
  } catch (emailError) {
    logger.error('Failed to send payment failed email', { route: 'api/webhooks/dodo', userId: user_id, error: emailError instanceof Error ? emailError.message : String(emailError) });
  }

  logger.info('Payment failed', { route: 'api/webhooks/dodo', userId: user_id, reason });
}

async function handleSubscriptionCreated(data: any) {
  const { plan, subscription_id, status, current_period_end } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('subscription.created with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      plan: plan,
      subscriptionId: subscription_id,
      subscriptionStatus: status,
      subscriptionEndDate: new Date(current_period_end * 1000)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'subscription_created',
      resource: 'billing',
      metadata: { plan, subscription_id, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Subscription created', { route: 'api/webhooks/dodo', userId: user_id, plan });

  // Conversion event — fired only from this verified subscription.created
  // webhook, carrying real fields parsed from the payload. Amount/currency are
  // included only when the payload actually provides them (dropped otherwise).
  emitSubscriptionCreated({
    userId: user_id,
    planId: plan,
    priceAmount: typeof data.amount === 'number' ? data.amount : undefined,
    currency: typeof data.currency === 'string' ? data.currency : undefined,
    provider: 'dodo',
  });
}

async function handleSubscriptionUpdated(data: any) {
  const { plan, subscription_id, status, current_period_end } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('subscription.updated with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      plan: plan,
      subscriptionStatus: status,
      subscriptionEndDate: new Date(current_period_end * 1000)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'subscription_updated',
      resource: 'billing',
      metadata: { plan, subscription_id, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Subscription updated', { route: 'api/webhooks/dodo', userId: user_id, plan });
}

async function handleSubscriptionCancelled(data: any) {
  const { subscription_id, cancellation_date, current_period_end } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('subscription.cancelled with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      subscriptionStatus: 'cancelled',
      subscriptionCancelledAt: new Date(cancellation_date * 1000)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'subscription_cancelled',
      resource: 'billing',
      metadata: { subscription_id, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  // Send subscription cancelled email to the user
  try {
    const user = await prisma.users.findUnique({
      where: { id: user_id },
      select: { email: true, name: true, plan: true, subscriptionEndDate: true }
    });
    if (user?.email) {
      const endTimestamp = current_period_end || cancellation_date;
      const endDate = new Date(endTimestamp * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      await sendSubscriptionCancelledEmail(
        user.email,
        user.name || 'there',
        endDate,
        user.plan || 'Pro'
      );
    }
  } catch (emailError) {
    logger.error('Failed to send subscription cancelled email', { route: 'api/webhooks/dodo', userId: user_id, error: emailError instanceof Error ? emailError.message : String(emailError) });
  }

  logger.info('Subscription cancelled', { route: 'api/webhooks/dodo', userId: user_id });
}

async function handleSubscriptionRenewed(data: any) {
  const { subscription_id, current_period_end, amount } = data;
  const user_id = resolveDodoUserId(data);
  if (!user_id) {
    logger.warn('subscription.renewed with no resolvable userId (missing checkout metadata)', {
      route: 'api/webhooks/dodo',
      subscription_id,
    });
    return;
  }

  await prisma.users.update({
    where: { id: user_id },
    data: {
      subscriptionEndDate: new Date(current_period_end * 1000),
      lastPaymentDate: new Date(),
      lastPaymentAmount: amount
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'subscription_renewed',
      resource: 'billing',
      metadata: { subscription_id, amount, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Subscription renewed', { route: 'api/webhooks/dodo', userId: user_id });
}

async function handleRefundCreated(data: any) {
  const { amount, transaction_id, reason } = data;
  const user_id = resolveDodoUserId(data);

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId: user_id,
      action: 'refund_created',
      resource: 'billing',
      metadata: { amount, transaction_id, reason, provider: 'dodo' },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Refund created', { route: 'api/webhooks/dodo', userId: user_id, amount });
}
