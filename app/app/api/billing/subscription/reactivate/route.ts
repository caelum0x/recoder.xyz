import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/payments/registry';
import { prisma } from '@/lib/prisma';

/**
 * The active merchant-of-record. Reactivation MUST reach this provider before we
 * clear the cancellation in our DB — otherwise the UI would report an active
 * subscription that the provider is still going to cancel at period end.
 * Mirrors the cancel route: defaults to `creem`; `PAYMENT_PROVIDER` overrides.
 */
function activeProviderName(): string {
  const explicit = (process.env.PAYMENT_PROVIDER || '').toLowerCase().trim();
  return explicit !== '' ? explicit : 'creem';
}

// POST /api/billing/subscription/reactivate - Resume a subscription scheduled to
// cancel at period end. Gated on a successful provider call (fail safe).
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // userId is unique on subscriptions, so this is the user's single row.
    const subscription = await prisma.subscriptions.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // A subscription is reactivatable if it is scheduled to cancel (webhook path
    // sets cancelAtPeriodEnd/status) OR the users mirror was flipped to a
    // cancelling/cancelled state by the API cancel route.
    const mirrorCancelling = ['cancelling', 'cancelled'].includes(
      (user.subscriptionStatus || '').toLowerCase()
    );
    const isReactivatable =
      subscription?.cancelAtPeriodEnd === true ||
      subscription?.status === 'cancelled' ||
      mirrorCancelling;

    if (!isReactivatable) {
      return NextResponse.json(
        { success: false, error: 'No cancelled subscription found' },
        { status: 404 }
      );
    }

    // Once the paid period has fully lapsed there is nothing to resume — the user
    // must start a new checkout instead.
    const periodEnd = subscription?.currentPeriodEnd || user.subscriptionEndDate;
    if (periodEnd && new Date() > new Date(periodEnd)) {
      return NextResponse.json(
        { success: false, error: 'Subscription period has already ended' },
        { status: 400 }
      );
    }

    // The provider-side subscription id lives on the subscriptions row, mirrored
    // onto users.subscriptionId by the webhook/cancel paths.
    const providerSubscriptionId = subscription?.providerId || user.subscriptionId;
    if (!providerSubscriptionId) {
      logger.error('Cannot reactivate — no provider subscription id on record', {
        route: 'api/billing/subscription/reactivate',
        userId: user.id,
      });
      return NextResponse.json(
        { success: false, error: 'No provider subscription on record; please contact support.' },
        { status: 400 }
      );
    }

    // Reactivate at the PROVIDER first and gate success on it. A provider that is
    // not configured, does not support reactivation, or refuses MUST fail loud —
    // we never clear the DB cancellation (which would mislead the user) unless the
    // provider actually resumed the subscription.
    const providerName = (subscription?.provider || activeProviderName()).toLowerCase();
    const provider = getProvider(providerName);
    if (!provider.configured) {
      logger.error('Cannot reactivate — payment provider not configured', {
        route: 'api/billing/subscription/reactivate',
        provider: providerName,
      });
      return NextResponse.json(
        { success: false, error: 'Billing provider is not configured; cannot reactivate the subscription. Please contact support.' },
        { status: 503 }
      );
    }

    if (typeof provider.reactivateSubscription !== 'function') {
      logger.error('Cannot reactivate — provider does not support reactivation', {
        route: 'api/billing/subscription/reactivate',
        provider: providerName,
      });
      return NextResponse.json(
        { success: false, error: 'Reactivation is not supported for your billing provider. Please contact support.' },
        { status: 422 }
      );
    }

    const reactivateResult = await provider.reactivateSubscription(providerSubscriptionId);
    // `=== false` (not `!result.ok`): non-strict tsconfig does not narrow the
    // discriminated union through a truthiness check (see the cancel route).
    if (reactivateResult.ok === false) {
      logger.error('Provider subscription reactivate failed', {
        route: 'api/billing/subscription/reactivate',
        provider: providerName,
        reason: reactivateResult.reason,
      });
      return NextResponse.json(
        { success: false, error: 'Failed to reactivate the subscription with the payment provider. No changes were made; please try again or contact support.' },
        { status: 502 }
      );
    }

    // Provider resumed the subscription — clear the cancellation in both the
    // subscriptions row (when present) and the users mirror.
    if (subscription) {
      await prisma.subscriptions.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          status: 'active',
          updatedAt: new Date(),
        },
      });
    }

    await prisma.users.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'active',
        subscriptionCancelledAt: null,
        cancelReason: null,
        cancelFeedback: null,
      },
    });

    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'subscription_reactivated',
        resource: 'billing',
        metadata: {
          provider: providerName,
          providerStatus: reactivateResult.status,
          subscriptionId: providerSubscriptionId,
        },
        ipAddress: req.headers.get('x-forwarded-for') || '0.0.0.0',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription reactivated successfully',
    });
  } catch (error) {
    logger.error('Error reactivating subscription', { route: 'api/billing/subscription/reactivate', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to reactivate subscription' },
      { status: 500 }
    );
  }
}
