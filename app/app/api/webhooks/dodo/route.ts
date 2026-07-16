import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from '@/lib/email';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || '';

function verifyDodoSignature(payload: string, signature: string): boolean {
  if (!DODO_WEBHOOK_SECRET) return false;

  const hmac = crypto.createHmac('sha256', DODO_WEBHOOK_SECRET);
  const expectedSignature = hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const signature = request.headers.get('x-dodo-signature') || '';
    const payload = await request.text();
    
    if (!verifyDodoSignature(payload, signature)) {
      logger.error('Invalid DODO webhook signature', { route: 'api/webhooks/dodo' });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(payload);
    const { type, data } = event;

    logger.info('Processing DODO webhook', { route: 'api/webhooks/dodo', type });

    switch (type) {
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

      case 'refund.created':
        await handleRefundCreated(data);
        break;

      default:
        logger.warn('Unhandled DODO webhook type', { route: 'api/webhooks/dodo', type });
    }

    return NextResponse.json({ success: true, processed: type });

  } catch (error) {
    logger.error('DODO webhook error', { route: 'api/webhooks/dodo', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentSucceeded(data: any) {
  const { user_id, amount, currency, transaction_id, subscription_id } = data;

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
  const { user_id, amount, reason, subscription_id, next_retry_date } = data;

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
  const { user_id, plan, subscription_id, status, current_period_end } = data;

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
}

async function handleSubscriptionUpdated(data: any) {
  const { user_id, plan, subscription_id, status, current_period_end } = data;

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
  const { user_id, subscription_id, cancellation_date, current_period_end } = data;

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
  const { user_id, subscription_id, current_period_end, amount } = data;

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
  const { user_id, amount, transaction_id, reason } = data;

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
