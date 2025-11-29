import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = authUser.email;

    // Get user data from users table
    const user = await prisma.users.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        subscription: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const plan = user.subscription || 'free';
    const isPremium = plan !== 'free';

    const quota = await prisma.user_quota.findUnique({
      where: { userId: user.id }
    });

    if (!quota) {
      // Create default quota if not exists
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const newQuota = await prisma.user_quota.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          sessionsPerDay: isPremium ? 50 : 6,
          sessionsUsedToday: 0,
          tokensPerSession: isPremium ? 50000 : 10000,
          periodStart: now,
          periodEnd: endOfDay,
          lastResetAt: now,
          requestsLimit: isPremium ? 10000 : 1000,
          requestsUsed: 0,
        },
      });

      return NextResponse.json({
        success: true,
        quota: {
          sessionsPerDay: newQuota.sessionsPerDay,
          sessionsUsedToday: newQuota.sessionsUsedToday,
          tokensPerSession: newQuota.tokensPerSession,
          remaining: newQuota.sessionsPerDay - newQuota.sessionsUsedToday,
          limit: newQuota.sessionsPerDay,
          periodStart: newQuota.periodStart,
          periodEnd: newQuota.periodEnd,
          lastResetAt: newQuota.lastResetAt
        }
      });
    }

    // Check if need to reset (new day)
    const now = new Date();
    if (now > quota.periodEnd) {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const updatedQuota = await prisma.user_quota.update({
        where: { id: quota.id },
        data: {
          sessionsUsedToday: 0,
          periodStart: now,
          periodEnd: endOfDay,
          lastResetAt: now,
          updatedAt: now,
        },
      });

      return NextResponse.json({
        success: true,
        quota: {
          sessionsPerDay: updatedQuota.sessionsPerDay,
          sessionsUsedToday: updatedQuota.sessionsUsedToday,
          tokensPerSession: updatedQuota.tokensPerSession,
          remaining: updatedQuota.sessionsPerDay - updatedQuota.sessionsUsedToday,
          limit: updatedQuota.sessionsPerDay,
          periodStart: updatedQuota.periodStart,
          periodEnd: updatedQuota.periodEnd,
          lastResetAt: updatedQuota.lastResetAt
        }
      });
    }

    return NextResponse.json({
      success: true,
      quota: {
        sessionsPerDay: quota.sessionsPerDay,
        sessionsUsedToday: quota.sessionsUsedToday,
        tokensPerSession: quota.tokensPerSession,
        remaining: quota.sessionsPerDay - quota.sessionsUsedToday,
        limit: quota.sessionsPerDay,
        periodStart: quota.periodStart,
        periodEnd: quota.periodEnd,
        lastResetAt: quota.lastResetAt
      }
    });
  } catch (error: any) {
    console.error('Get quota error:', error);
    return NextResponse.json({ error: 'Failed to get quota' }, { status: 500 });
  }
}
