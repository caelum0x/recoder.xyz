/**
 * ONE subscription upsert path for all payment providers (C6).
 *
 * Extracted verbatim from the Creem webhook route (the pattern-setter): every
 * provider webhook normalizes into NormalizedWebhookEvent and lands here, so
 * the subscriptions table and the users mirror fields
 * (subscriptionPlan/subscriptionStatus/subscriptionId/paymentStatus) are
 * written by exactly one code path. All writes are absolute-state
 * upserts/updates so webhook redelivery is idempotent.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { PLANS } from '@/lib/pricing-config';
import type { NormalizedWebhookEvent } from './provider';

/**
 * Only a plan id our pricing config actually knows may reach the
 * users.subscriptionPlan mirror — Paddle events can carry a raw numeric
 * subscription_plan_id ("593"), and mirroring that would make plan-limit
 * enforcement read the user as FREE tier. Unrecognized ids stay on the
 * subscriptions row (raw, for audit) but never overwrite the user's tier.
 */
function mirrorablePlanId(planId: string | undefined): string | undefined {
  return planId && Object.prototype.hasOwnProperty.call(PLANS, planId) ? planId : undefined;
}

export interface SubscriptionEventContext {
  /** subscriptions.provider value ('creem' | 'dodo' | 'paddle' | ...). */
  provider: string;
  /** Route label for log context, e.g. 'api/webhooks/creem'. */
  route: string;
}

/**
 * Checkout metadata round-trips amount/interval — read the NORMALIZER's
 * envelope-agnostic extraction, never re-walk `raw` (an `object` vs `data`
 * envelope divergence here silently dropped fields).
 */
function metadataOf(event: NormalizedWebhookEvent): Record<string, unknown> {
  return event.metadata ?? {};
}

async function findByProviderId(providerId: string) {
  return prisma.subscriptions.findFirst({ where: { providerId } });
}

export async function upsertSubscriptionFromEvent(
  event: NormalizedWebhookEvent,
  ctx: SubscriptionEventContext
): Promise<void> {
  if (!event.userId) {
    // Without our metadata userId there is nothing to attach the subscription
    // to. Ack (stop redelivery) but say so truthfully.
    logger.error('subscription.created without a userId', {
      route: ctx.route,
      provider: ctx.provider,
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
      provider: ctx.provider,
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
      provider: ctx.provider,
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
      ...(mirrorablePlanId(event.planId) ? { subscriptionPlan: event.planId } : {}),
      subscriptionStatus: status,
      subscriptionId: event.subscriptionId,
    },
  });

  logger.info('Subscription created', {
    route: ctx.route,
    provider: ctx.provider,
    userId: event.userId,
    planId: event.planId,
  });
}

export async function updateSubscriptionFromEvent(
  event: NormalizedWebhookEvent,
  ctx: SubscriptionEventContext
): Promise<void> {
  const subscription = await findByProviderId(event.subscriptionId);
  if (!subscription) {
    // Out-of-order delivery (update before create): fall back to the created
    // path when the payload carries our userId, otherwise log and ack.
    if (event.userId) {
      await upsertSubscriptionFromEvent(event, ctx);
      return;
    }
    logger.warn('subscription.updated for unknown subscription', {
      route: ctx.route,
      provider: ctx.provider,
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
      ...(mirrorablePlanId(event.planId) ? { subscriptionPlan: event.planId } : {}),
      ...(event.status ? { subscriptionStatus: event.status } : {}),
    },
  });

  logger.info('Subscription updated', {
    route: ctx.route,
    provider: ctx.provider,
    userId: subscription.userId,
    planId: event.planId,
  });
}

export async function cancelSubscriptionFromEvent(
  event: NormalizedWebhookEvent,
  ctx: SubscriptionEventContext
): Promise<void> {
  const subscription = await findByProviderId(event.subscriptionId);
  if (!subscription) {
    logger.warn('Cancel for unknown subscription', {
      route: ctx.route,
      provider: ctx.provider,
      subscriptionId: event.subscriptionId,
    });
    return;
  }

  await prisma.subscriptions.update({
    where: { id: subscription.id },
    data: {
      status: 'cancelled',
      // Readers depend on this flag (reactivate route queries it; dashboards
      // label it) — the pre-consolidation Paddle handler set it, keep parity.
      cancelAtPeriodEnd: true,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.users.update({
    where: { id: subscription.userId },
    data: { subscriptionStatus: 'cancelled' },
  });

  logger.info('Subscription cancelled', {
    route: ctx.route,
    provider: ctx.provider,
    userId: subscription.userId,
  });
}

export async function recordPaymentOutcomeFromEvent(
  event: NormalizedWebhookEvent,
  paymentStatus: 'active' | 'failed',
  ctx: SubscriptionEventContext
): Promise<void> {
  const userId = event.userId ?? (await findByProviderId(event.subscriptionId))?.userId;
  if (!userId) {
    logger.warn('Payment event for unknown subscription', {
      route: ctx.route,
      provider: ctx.provider,
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

  logger.info('Payment outcome recorded', {
    route: ctx.route,
    provider: ctx.provider,
    userId,
    paymentStatus,
  });
}
