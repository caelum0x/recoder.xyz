import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cli/quota
 * Get user's quota and usage information
 * Used by CLI to check if user can make requests
 */
export const GET = withCLIAuth(async (request: NextRequest, context) => {
  try {
    // Get user quota
    const quota = await prisma.user_quota.findUnique({
      where: { userId: context.userId },
    });

    if (!quota) {
      // Create default quota if not exists
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const newQuota = await prisma.user_quota.create({
        data: {
          userId: context.userId,
          sessionsPerDay: context.isPremium ? 50 : 6,
          sessionsUsedToday: 0,
          tokensPerSession: context.isPremium ? 50000 : 10000,
          periodStart: now,
          periodEnd: endOfDay,
          lastResetAt: now,
        },
      });

      return NextResponse.json({
        quota: {
          sessionsPerDay: newQuota.sessionsPerDay,
          sessionsUsed: newQuota.sessionsUsedToday,
          sessionsRemaining: newQuota.sessionsPerDay - newQuota.sessionsUsedToday,
          tokensPerSession: newQuota.tokensPerSession,
          periodEnd: newQuota.periodEnd,
          isUnlimited: context.plan === 'enterprise',
        },
        canMakeRequest: true,
      });
    }

    // Check if need to reset (new day)
    const now = new Date();
    if (now > quota.periodEnd) {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      await prisma.user_quota.update({
        where: { id: quota.id },
        data: {
          sessionsUsedToday: 0,
          periodStart: now,
          periodEnd: endOfDay,
          lastResetAt: now,
        },
      });

      quota.sessionsUsedToday = 0;
    }

    const sessionsRemaining = quota.sessionsPerDay - quota.sessionsUsedToday;
    const canMakeRequest = context.plan === 'enterprise' || sessionsRemaining > 0;

    return NextResponse.json({
      quota: {
        sessionsPerDay: quota.sessionsPerDay,
        sessionsUsed: quota.sessionsUsedToday,
        sessionsRemaining,
        tokensPerSession: quota.tokensPerSession,
        periodEnd: quota.periodEnd,
        isUnlimited: context.plan === 'enterprise',
      },
      canMakeRequest,
      message: canMakeRequest
        ? 'Quota available'
        : 'Daily quota exceeded. Upgrade your plan or wait for reset.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get quota' },
      { status: 500 }
    );
  }
});
