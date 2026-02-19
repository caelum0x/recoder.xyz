import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { serialize } from 'php-serialize';
import { logger } from '@/lib/logger';

const PADDLE_PUBLIC_KEY = process.env.PADDLE_PUBLIC_KEY || '';

function verifyPaddleSignature(body: any): boolean {
  if (!PADDLE_PUBLIC_KEY) return false;

  const signature = body.p_signature;
  const keys = Object.keys(body).filter(key => key !== 'p_signature').sort();
  
  const data: any = {};
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
    const body = await request.json();
    
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

async function handlePaymentSucceeded(data: any) {
  const { passthrough, sale_gross, currency, order_id, receipt_url } = data;
  let userId: string;

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      lastPaymentDate: new Date(),
      lastPaymentAmount: parseFloat(sale_gross),
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
        amount: sale_gross,
        currency,
        order_id,
        receipt_url,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle payment succeeded', { route: 'api/webhooks/paddle', userId, amount: sale_gross, currency });
}

async function handleSubscriptionCreated(data: any) {
  const { passthrough, subscription_id, subscription_plan_id, status, next_bill_date } = data;
  let userId: string;
  let planName: string = 'pro';

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
    planName = passthroughData.plan || 'pro';
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      plan: planName,
      subscriptionId: subscription_id,
      subscriptionStatus: status,
      subscriptionEndDate: new Date(next_bill_date)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_created',
      resource: 'billing',
      metadata: {
        subscription_id,
        subscription_plan_id,
        plan: planName,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription created', { route: 'api/webhooks/paddle', userId, plan: planName });
}

async function handleSubscriptionUpdated(data: any) {
  const { passthrough, subscription_id, subscription_plan_id, status, next_bill_date } = data;
  let userId: string;
  let planName: string = 'pro';

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
    planName = passthroughData.plan || 'pro';
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      plan: planName,
      subscriptionStatus: status,
      subscriptionEndDate: new Date(next_bill_date)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_updated',
      resource: 'billing',
      metadata: {
        subscription_id,
        subscription_plan_id,
        plan: planName,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription updated', { route: 'api/webhooks/paddle', userId, plan: planName });
}

async function handleSubscriptionCancelled(data: any) {
  const { passthrough, subscription_id, cancellation_effective_date } = data;
  let userId: string;

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'cancelled',
      subscriptionCancelledAt: new Date(cancellation_effective_date)
    }
  });

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_cancelled',
      resource: 'billing',
      metadata: {
        subscription_id,
        cancellation_date: cancellation_effective_date,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription cancelled', { route: 'api/webhooks/paddle', userId });
}

async function handleSubscriptionPaymentSucceeded(data: any) {
  const { passthrough, subscription_id, sale_gross, next_bill_date, receipt_url } = data;
  let userId: string;

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.users.update({
    where: { id: userId },
    data: {
      subscriptionEndDate: new Date(next_bill_date),
      lastPaymentDate: new Date(),
      lastPaymentAmount: parseFloat(sale_gross),
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
        subscription_id,
        amount: sale_gross,
        receipt_url,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription payment succeeded', { route: 'api/webhooks/paddle', userId, amount: sale_gross });
}

async function handleSubscriptionPaymentFailed(data: any) {
  const { passthrough, subscription_id, amount, hard_failure } = data;
  let userId: string;

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

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
        subscription_id,
        amount,
        hard_failure,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle subscription payment failed', { route: 'api/webhooks/paddle', userId });
}

async function handleSubscriptionPaymentRefunded(data: any) {
  const { passthrough, subscription_id, amount, refund_reason } = data;
  let userId: string;

  try {
    const passthroughData = JSON.parse(passthrough);
    userId = passthroughData.user_id;
  } catch {
    logger.error('Invalid passthrough data in Paddle webhook', { route: 'api/webhooks/paddle' });
    return;
  }

  await prisma.audit_logs.create({
    data: {
        id: crypto.randomUUID(),
      userId,
      action: 'subscription_payment_refunded',
      resource: 'billing',
      metadata: {
        subscription_id,
        amount,
        refund_reason,
        provider: 'paddle'
      },
      ipAddress: '0.0.0.0',
    }
  });

  logger.info('Paddle payment refunded', { route: 'api/webhooks/paddle', userId, amount });
}
