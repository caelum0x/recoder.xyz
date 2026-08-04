import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { prisma } from '@/lib/prisma';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * GET /api/cli/entitlements
 *
 * Authoritative tier/feature check for the desktop/CLI:
 * {plan, status, features, quota}. Plan/features come from the server-side
 * entitlements table (lib/entitlements.ts); quota mirrors the read that
 * GET /api/cli/quota performs, but without writing (this endpoint is a pure
 * read — quota bootstrap/reset stays owned by the quota route).
 */
export const GET = withCLIAuth(async (_request: NextRequest, context) => {
  try {
    const [user, subscription, quota] = await Promise.all([
      prisma.users.findUnique({
        where: { id: context.userId },
        select: { subscriptionPlan: true, subscriptionStatus: true },
      }),
      prisma.subscriptions.findFirst({
        where: { userId: context.userId, status: 'active' },
        select: { planId: true, status: true },
      }),
      prisma.user_quota.findUnique({
        where: { userId: context.userId },
      }),
    ]);

    const entitlements = resolveEntitlements(user, subscription);

    // Same defaults the quota route applies when no row exists yet
    const sessionsPerDay = quota?.sessionsPerDay ?? (context.isPremium ? 50 : 6);
    const tokensPerSession = quota?.tokensPerSession ?? (context.isPremium ? 50000 : 10000);
    // Past-period usage counts as reset even if the quota route hasn't persisted it yet
    const sessionsUsed =
      quota && new Date() <= quota.periodEnd ? quota.sessionsUsedToday : 0;

    const response = NextResponse.json({
      plan: entitlements.plan,
      status: entitlements.status,
      features: entitlements.features,
      quota: {
        sessionsPerDay,
        sessionsUsed,
        sessionsRemaining: sessionsPerDay - sessionsUsed,
        tokensPerSession,
        periodEnd: quota?.periodEnd ?? null,
        isUnlimited: entitlements.plan === 'enterprise',
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve entitlements' },
      { status: 500 }
    );
  }
});
