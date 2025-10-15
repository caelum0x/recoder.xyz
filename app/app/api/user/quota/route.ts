import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth-helper';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quota = await prisma.userQuota.findUnique({
      where: { userId: user.id }
    });

    if (!quota) {
      return NextResponse.json({ error: 'Quota not found' }, { status: 404 });
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
