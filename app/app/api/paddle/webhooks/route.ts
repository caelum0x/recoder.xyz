/**
 * Paddle Webhooks Handler
 * Processes subscription events from Paddle
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('paddle-signature');

    // Verify webhook signature
    if (!verifyPaddleWebhook(body, signature)) {
      return NextResponse.json({
        success: false,
        error: 'invalid_signature'
      }, { status: 401 });
    }

    const event = JSON.parse(body);
    
    // Handle different event types
    switch (event.alert_name) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;
      
      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;
      
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;
      
      case 'subscription_payment_succeeded':
        await handlePaymentSucceeded(event);
        break;
      
      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;
      
      default:
        console.log('Unhandled Paddle event:', event.alert_name);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Paddle webhook error:', error);
    return NextResponse.json({
      success: false,
      error: 'webhook_error'
    }, { status: 500 });
  }
}

function verifyPaddleWebhook(body: string, signature: string | null): boolean {
  if (!signature || !process.env.PADDLE_WEBHOOK_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function handleSubscriptionCreated(event: any) {
  const { passthrough, subscription_id, status } = event;
  const { userId, plan } = JSON.parse(passthrough || '{}');

  if (!userId) {
    console.warn('[Paddle] subscription_created missing userId in passthrough');
    return;
  }

  console.log('[Paddle] Subscription created:', { userId, plan, subscription_id, status });

  await prisma.subscriptions.upsert({
    where: { userId },
    create: {
      id: crypto.randomUUID(),
      userId,
      status: status || 'active',
      provider: 'paddle',
      providerId: String(subscription_id),
      planId: plan || 'pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    update: {
      status: status || 'active',
      provider: 'paddle',
      providerId: String(subscription_id),
      planId: plan || 'pro',
      updatedAt: new Date(),
    },
  });
}

async function handleSubscriptionUpdated(event: any) {
  const { subscription_id, status } = event;
  console.log('[Paddle] Subscription updated:', { subscription_id, status });

  const sub = await prisma.subscriptions.findFirst({
    where: { providerId: String(subscription_id), provider: 'paddle' },
  });

  if (sub) {
    await prisma.subscriptions.update({
      where: { id: sub.id },
      data: { status: status || sub.status, updatedAt: new Date() },
    });
  }
}

async function handleSubscriptionCancelled(event: any) {
  const { subscription_id } = event;
  console.log('[Paddle] Subscription cancelled:', { subscription_id });

  const sub = await prisma.subscriptions.findFirst({
    where: { providerId: String(subscription_id), provider: 'paddle' },
  });

  if (sub) {
    await prisma.subscriptions.update({
      where: { id: sub.id },
      data: {
        status: 'cancelled',
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

async function handlePaymentSucceeded(event: any) {
  const { subscription_id } = event;
  console.log('[Paddle] Payment succeeded:', { subscription_id });
}

async function handlePaymentFailed(event: any) {
  const { subscription_id } = event;
  console.log('[Paddle] Payment failed:', { subscription_id });
}
