import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/payments/registry';

/**
 * Fallback merchant-of-record when a user has no subscriptions row (or it has
 * no provider recorded) to resolve from. Cancellation MUST reach the REAL
 * provider before we mark the DB cancelled — otherwise the card keeps being
 * charged while the UI reports success (the bug this route previously
 * shipped: the old `paddle_`/`dodo_` prefix branches were dead because ids
 * are never stored with those prefixes, so NO provider was ever called and
 * failures were swallowed). This function is only the LAST resort — see
 * `subscription?.provider` below, which mirrors change-plan/reactivate and
 * is what actually routes a real Dodo or Paddle subscriber correctly.
 * Defaults to `creem`; `PAYMENT_PROVIDER` overrides it.
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

    // userId is unique on subscriptions, so this is the user's single row.
    const subscription = await prisma.subscriptions.findFirst({ where: { userId: user.id } });

    // Cancel at the PROVIDER first and gate success on it. A provider that is not
    // configured, or a failed/denied cancel, MUST fail loud — we never mark the DB
    // cancelled (which would stop the user seeing the charge) while the card keeps
    // being billed.
    //
    // Resolve from the SUBSCRIPTION'S OWN provider first, falling back to the
    // global default only when no row/provider is on record — mirrors
    // change-plan and reactivate. A static global default alone is wrong the
    // moment more than one provider has ever been live: a real Dodo
    // subscriber's cancel would silently be sent to Creem's API (whatever
    // `PAYMENT_PROVIDER` happens to default to) and fail, even though their
    // subscription is perfectly valid — just checked against the wrong
    // provider.
    const providerName = (subscription?.provider || activeProviderName()).toLowerCase();
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

    // Provider id semantics differ per adapter: the Dodo wrapper resolves our
    // internal subscriptions.id itself, while Creem/Paddle use the
    // provider-side id (mirrors change-plan / reactivate's `idForProvider`).
    const providerSubscriptionId = subscription?.providerId || user.subscriptionId;
    const idForProvider = providerName === 'dodo' ? subscription?.id : providerSubscriptionId;
    if (!idForProvider) {
      return NextResponse.json(
        { error: 'No subscription reference available for the billing provider.' },
        { status: 409 }
      );
    }

    const cancelResult = await provider.cancelSubscription(idForProvider);
    // `=== false` (not `!cancelResult.ok`): this tsconfig is non-strict, where
    // truthiness checks do not narrow discriminated unions (see checkout/creem).
    if (cancelResult.ok === false) {
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
