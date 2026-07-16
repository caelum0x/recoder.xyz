import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolveDodoApiKey, resolvePaddleAuthCode, resolvePaddleVendorId } from '@/lib/billing-credentials';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { reason, feedback, cancelImmediate } = body;

    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.subscriptionId) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const cancellationDate = cancelImmediate 
      ? new Date() 
      : user.subscriptionEndDate || new Date();

    await prisma.users.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: cancelImmediate ? 'cancelled' : 'cancelling',
        subscriptionCancelledAt: new Date(),
        subscriptionEndDate: cancellationDate,
        cancelReason: reason,
        cancelFeedback: feedback
      }
    });

    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'subscription_cancelled',
        resource: 'billing',
        metadata: {
          reason,
          feedback,
          cancelImmediate,
          oldPlan: user.plan,
          subscriptionId: user.subscriptionId
        },
        ipAddress: request.headers.get('x-forwarded-for') || '0.0.0.0'
      }
    });

    if (user.subscriptionId.startsWith('paddle_')) {
      await cancelPaddleSubscription(user.subscriptionId);
    } else if (user.subscriptionId.startsWith('dodo_')) {
      await cancelDodoSubscription(user.subscriptionId);
    }

    return NextResponse.json({
      success: true,
      message: cancelImmediate 
        ? 'Subscription cancelled immediately' 
        : `Subscription will be cancelled on ${cancellationDate.toLocaleDateString()}`,
      cancellationDate
    });

  } catch (error) {
    logger.error('Cancellation error', { route: 'api/billing/subscription/cancel', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

async function cancelPaddleSubscription(subscriptionId: string) {
  try {
    const PADDLE_VENDOR_ID = resolvePaddleVendorId();
    const PADDLE_API_KEY = resolvePaddleAuthCode();

    if (!PADDLE_VENDOR_ID || !PADDLE_API_KEY) {
      logger.error('Paddle credentials not configured', { route: 'api/billing/subscription/cancel' });
      return;
    }

    const response = await fetch('https://vendors.paddle.com/api/2.0/subscription/users_cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        vendor_id: PADDLE_VENDOR_ID,
        vendor_auth_code: PADDLE_API_KEY,
        subscription_id: subscriptionId.replace('paddle_', '')
      })
    });

    const data = await response.json();
    
    if (!data.success) {
      logger.error('Paddle cancellation failed', { route: 'api/billing/subscription/cancel', data });
    }
  } catch (error) {
    logger.error('Error cancelling Paddle subscription', { route: 'api/billing/subscription/cancel', error: error instanceof Error ? error.message : String(error) });
  }
}

async function cancelDodoSubscription(subscriptionId: string) {
  try {
    const DODO_API_KEY = resolveDodoApiKey();

    if (!DODO_API_KEY) {
      logger.error('DODO API key not configured', { route: 'api/billing/subscription/cancel' });
      return;
    }

    const response = await fetch(`https://api.dodopayments.com/v1/subscriptions/${subscriptionId.replace('dodo_', '')}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DODO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      logger.error('DODO cancellation failed', { route: 'api/billing/subscription/cancel', data });
    }
  } catch (error) {
    logger.error('Error cancelling DODO subscription', { route: 'api/billing/subscription/cancel', error: error instanceof Error ? error.message : String(error) });
  }
}
