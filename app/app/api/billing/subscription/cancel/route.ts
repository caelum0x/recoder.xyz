import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/payments/registry';

/**
 * The active merchant-of-record. Cancellation MUST reach this provider before we
 * mark the DB cancelled — otherwise the card keeps being charged while the UI
 * reports success (the bug this route previously shipped: the old `paddle_`/`dodo_`
 * prefix branches were dead because ids are never stored with those prefixes, so
 * NO provider was ever called and failures were swallowed). Defaults to `creem`
 * (the active MoR); `PAYMENT_PROVIDER` overrides it.
 */
function activeProviderName(): string {
  const explicit = (process.env.PAYMENT_PROVIDER || '').toLowerCase().trim();
  return explicit !== '' ? explicit : 'creem';
}

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

    // Cancel at the PROVIDER first and gate success on it. A provider that is not
    // configured, or a failed/denied cancel, MUST fail loud — we never mark the DB
    // cancelled (which would stop the user seeing the charge) while the card keeps
    // being billed.
    const providerName = activeProviderName();
    const provider = getProvider(providerName);
    if (!provider.configured) {
      logger.error('Cannot cancel — payment provider not configured', {
        route: 'api/billing/subscription/cancel',
        provider: providerName,
      });
      return NextResponse.json(
        { error: 'Billing provider is not configured; cannot cancel the subscription. Please contact support.' },
        { status: 503 }
      );
    }

    const cancelResult = await provider.cancelSubscription(user.subscriptionId);
    if (!cancelResult.ok) {
      logger.error('Provider subscription cancel failed', {
        route: 'api/billing/subscription/cancel',
        provider: providerName,
        reason: cancelResult.reason,
      });
      return NextResponse.json(
        { error: 'Failed to cancel the subscription with the payment provider. No changes were made; please try again or contact support.' },
        { status: 502 }
      );
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
          provider: providerName,
          providerStatus: cancelResult.status,
          oldPlan: user.plan,
          subscriptionId: user.subscriptionId
        },
        ipAddress: request.headers.get('x-forwarded-for') || '0.0.0.0'
      }
    });

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
