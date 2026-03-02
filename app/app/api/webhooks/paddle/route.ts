import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { serialize } from 'php-serialize';
import { logger } from '@/lib/logger';
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from '@/lib/email';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const webhookRateLimiter = rateLimit(rateLimitConfigs.webhook);
const PADDLE_PUBLIC_KEY = process.env.PADDLE_PUBLIC_KEY;
if (!PADDLE_PUBLIC_KEY && process.env.NODE_ENV === 'production') {
  console.error('[paddle-webhook] PADDLE_PUBLIC_KEY is not configured — webhook verification will reject all requests');
}

type JsonObject = Record<string, unknown>;

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parsePassthrough(data: JsonObject): { userId: string; plan?: string } | null {
  const passthrough = getString(data.passthrough);
  if (!passthrough) return null;
  try {
    const parsed = JSON.parse(passthrough);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const userId = getString(record.user_id);
    if (!userId) return null;
    const plan = getString(record.plan) || undefined;
    return { userId, plan };
  } catch {
    return null;
  }
}

function verifyPaddleSignature(body: JsonObject): boolean {
  if (!PADDLE_PUBLIC_KEY) return false;

  const signature = getString(body.p_signature);
  if (!signature) return false;
  const keys = Object.keys(body).filter(key => key !== 'p_signature').sort();
  
  const data: JsonObject = {};
  keys.forEach(key => {
    data[key] = body[key];
  });

  const serialized = serialize(data);
  
  try {
    const verifier = crypto.createVerify('sha1');
    verifier.update(serialized);
    verifier.end();
    
    return verifier.verify(PADDLE_PUBLIC_KEY, signature, 'base64');
  } catch (error) {
    logger.error('Paddle signature verification error', { route: 'api/webhooks/paddle', error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await webhookRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json()) as JsonObject;

    if (!verifyPaddleSignature(body)) {
      logger.error('Invalid Paddle webhook signature', { route: 'api/webhooks/paddle' });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const alertName = body.alert_name;
    logger.info('Processing Paddle webhook', { route: 'api/webhooks/paddle', alertName });

    switch (alertName) {
      case 'payment_succeeded':
        await handlePaymentSucceeded(body);
        break;

      case 'subscription_created':
        await handleSubscriptionCreated(body);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(body);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(body);
        break;

      case 'subscription_payment_succeeded':
        await handleSubscriptionPaymentSucceeded(body);
        break;

      case 'subscription_payment_failed':
        await handleSubscriptionPaymentFailed(body);
        break;

      case 'subscription_payment_refunded':
        await handleSubscriptionPaymentRefunded(body);
        break;

      default:
        logger.warn('Unhandled Paddle webhook', { route: 'api/webhooks/paddle', alertName });
    }

    return NextResponse.json({ success: true, processed: alertName });

  } catch (error) {
    logger.error('Paddle webhook error', { route: 'api/webhooks/paddle', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentSucceeded(data: JsonObject) {
  const { passthrough, sale_gross, currency, order_id, receipt_url } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;

  await prisma.users.update({
    where: { id: userId },
    data: {
      lastPaymentDate: new Date(),
      lastPaymentAmount: parseFloat(getString(sale_gross)),
      paymentStatus: 'active'
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'payment_succeeded',
      resource: 'billing',
      metadata: {
        amount: getString(sale_gross),
        currency: getString(currency),
        order_id: getString(order_id),
        receipt_url: getString(receipt_url),
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle payment succeeded', { route: 'api/webhooks/paddle', userId, amount: getString(sale_gross), currency: getString(currency) });
}

async function handleSubscriptionCreated(data: JsonObject) {
  const { passthrough, subscription_id, subscription_plan_id, status, next_bill_date } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;
  const planName = parsed.plan || 'pro';

  await prisma.users.update({
    where: { id: userId },
    data: {
      plan: planName,
      subscriptionId: getString(subscription_id),
      subscriptionStatus: getString(status),
      subscriptionEndDate: new Date(getString(next_bill_date))
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_created',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        subscription_plan_id: getString(subscription_plan_id),
        plan: planName,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription created', { route: 'api/webhooks/paddle', userId, plan: planName });
}

async function handleSubscriptionUpdated(data: JsonObject) {
  const { passthrough, subscription_id, subscription_plan_id, status, next_bill_date } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;
  const planName = parsed.plan || 'pro';

  await prisma.users.update({
    where: { id: userId },
    data: {
      plan: planName,
      subscriptionStatus: getString(status),
      subscriptionEndDate: new Date(getString(next_bill_date))
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_updated',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        subscription_plan_id: getString(subscription_plan_id),
        plan: planName,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription updated', { route: 'api/webhooks/paddle', userId, plan: planName });
}

async function handleSubscriptionCancelled(data: JsonObject) {
  const { passthrough, subscription_id, cancellation_effective_date } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;
  const planName = parsed.plan || 'Pro';

  await prisma.users.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'cancelled',
      subscriptionCancelledAt: new Date(getString(cancellation_effective_date))
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_cancelled',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        cancellation_date: getString(cancellation_effective_date),
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  // Send subscription cancelled email to the user
  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { email: true, name: true, plan: true, subscriptionEndDate: true }
    });
    if (user?.email) {
      const cancellationDate = getString(cancellation_effective_date);
      const endDate = cancellationDate
        ? new Date(cancellationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : user.subscriptionEndDate
          ? user.subscriptionEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'the end of your billing period';
      await sendSubscriptionCancelledEmail(
        user.email,
        user.name || 'there',
        endDate,
        user.plan || planName
      );
    }
  } catch (emailError) {
    logger.error('Failed to send subscription cancelled email', { route: 'api/webhooks/paddle', userId, error: emailError instanceof Error ? emailError.message : String(emailError) });
  }

  logger.info('Paddle subscription cancelled', { route: 'api/webhooks/paddle', userId });
}

async function handleSubscriptionPaymentSucceeded(data: JsonObject) {
  const { passthrough, subscription_id, sale_gross, next_bill_date, receipt_url } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;

  await prisma.users.update({
    where: { id: userId },
    data: {
      subscriptionEndDate: new Date(getString(next_bill_date)),
      lastPaymentDate: new Date(),
      lastPaymentAmount: parseFloat(getString(sale_gross)),
      paymentStatus: 'active'
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_payment_succeeded',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        amount: getString(sale_gross),
        receipt_url: getString(receipt_url),
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription payment succeeded', { route: 'api/webhooks/paddle', userId, amount: getString(sale_gross) });
}

async function handleSubscriptionPaymentFailed(data: JsonObject) {
  const { passthrough, subscription_id, amount, hard_failure, next_retry_date } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;

  await prisma.users.update({
    where: { id: userId },
    data: {
      paymentStatus: 'failed'
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_payment_failed',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        amount: getString(amount),
        hard_failure: getString(hard_failure),
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  // Send payment failed email to the user
  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { email: true, name: true, plan: true }
    });
    if (user?.email) {
      const retryDateValue = getString(next_retry_date);
      const retryDate = retryDateValue
        ? new Date(retryDateValue).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined;
      await sendPaymentFailedEmail(
        user.email,
        user.name || 'there',
        user.plan || 'Pro',
        retryDate
      );
    }
  } catch (emailError) {
    logger.error('Failed to send payment failed email', { route: 'api/webhooks/paddle', userId, error: emailError instanceof Error ? emailError.message : String(emailError) });
  }

  logger.info('Paddle subscription payment failed', { route: 'api/webhooks/paddle', userId });
}

async function handleSubscriptionPaymentRefunded(data: JsonObject) {
  const { passthrough, subscription_id, amount, refund_reason } = data;
  const parsed = parsePassthrough(data);
  if (!parsed) {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }
  const userId = parsed.userId;

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_payment_refunded',
      resource: 'billing',
      metadata: {
        subscription_id: getString(subscription_id),
        amount: getString(amount),
        refund_reason: getString(refund_reason),
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle payment refunded', { route: 'api/webhooks/paddle', userId, amount: getString(amount) });
}
