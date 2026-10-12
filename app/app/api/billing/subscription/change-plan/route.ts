import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/payments/registry';
import { PLANS, type PlanId } from '@/lib/pricing-config';
import { prisma } from '@/lib/prisma';

/**
 * Upgrade / downgrade an EXISTING paid subscription in place (prorated by the
 * provider). New subscribers (no active subscription) go through checkout via
 * /api/billing/create-checkout instead.
 *
 * The change MUST succeed at the payment provider before we touch our DB — a
 * failed or unconfigured provider fails loud so the UI never shows a plan the
 * customer is not actually being billed for. Final state is reconciled by the
 * provider's subscription.updated webhook; we optimistically mirror the new plan
 * so the UI reflects the change immediately.
 */
function activeProviderName(): string {
  const explicit = (process.env.PAYMENT_PROVIDER || '').toLowerCase().trim();
  return explicit !== '' ? explicit : 'creem';
}

function isPurchasablePlan(planId: string): planId is PlanId {
  return (
    Object.prototype.hasOwnProperty.call(PLANS, planId) &&
    planId !== 'free' &&
    planId !== 'enterprise'
  );
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const planId = typeof body?.planId === 'string' ? body.planId.trim() : '';

    if (!isPurchasablePlan(planId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or non-purchasable plan' },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const subscription = await prisma.subscriptions.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    const providerSubscriptionId = subscription?.providerId || user.subscriptionId;
    if (!providerSubscriptionId && !subscription?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active subscription to change. Start a checkout to subscribe first.',
          requiresCheckout: true,
        },
        { status: 409 }
      );
    }

    const currentPlan = subscription?.planId || user.subscriptionPlan || 'free';
    if (currentPlan === planId) {
      return NextResponse.json(
        { success: false, error: 'You are already on this plan' },
        { status: 400 }
      );
    }

    const providerName = (subscription?.provider || activeProviderName()).toLowerCase();
    const provider = getProvider(providerName);
    if (!provider.configured) {
      logger.error('Cannot change plan — payment provider not configured', {
        route: 'api/billing/subscription/change-plan',
        provider: providerName,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Billing provider is not configured; cannot change the plan. Please contact support.',
        },
        { status: 503 }
      );
    }

    // Provider id semantics differ per adapter: the Dodo wrapper resolves our
    // internal subscriptions.id itself, while Creem/Paddle use the provider-side
    // id. Pass whichever the resolved provider expects.
    const idForProvider =
      providerName === 'dodo' ? subscription?.id : providerSubscriptionId;
    if (!idForProvider) {
      return NextResponse.json(
        { success: false, error: 'No subscription reference available for the billing provider.' },
        { status: 409 }
      );
    }

    const result = await provider.changePlan(idForProvider, planId);
    // `=== false`: non-strict tsconfig does not narrow the union via truthiness.
    if (result.ok === false) {
      logger.error('Provider plan change failed', {
        route: 'api/billing/subscription/change-plan',
        provider: providerName,
        reason: result.reason,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to change the plan with the payment provider. No changes were made; please try again or contact support.',
        },
        { status: 502 }
      );
    }

    // Optimistically mirror the new plan; the subscription.updated webhook is the
    // source of truth and will reconcile amount/status/period.
    const plan = PLANS[planId];
    if (subscription) {
      await prisma.subscriptions.update({
        where: { id: subscription.id },
        data: {
          planId,
          amount: plan.price,
          interval: plan.period,
          updatedAt: new Date(),
        },
      });
    }

    await prisma.users.update({
      where: { id: user.id },
      data: { subscriptionPlan: planId },
    });

    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'subscription_plan_changed',
        resource: 'billing',
        metadata: {
          provider: providerName,
          fromPlan: currentPlan,
          toPlan: planId,
          subscriptionId: providerSubscriptionId,
        },
        ipAddress: request.headers.get('x-forwarded-for') || '0.0.0.0',
      },
    });

    return NextResponse.json({
      success: true,
      plan: planId,
      message: `Plan changed to ${plan.name}. Billing will be prorated by your provider.`,
    });
  } catch (error) {
    logger.error('Plan change error', {
      route: 'api/billing/subscription/change-plan',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to change plan' },
      { status: 500 }
    );
  }
}
