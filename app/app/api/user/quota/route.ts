import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensureCommercialQuota, formatCommercialQuotaResponse } from '@/lib/commercial-quota';
import { normalizeCommercialPlan } from '@/lib/plan-entitlements';

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
        subscriptionPlan: true,
        subscription: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const plan = normalizeCommercialPlan(user.subscriptionPlan || user.subscription || 'free');
    const quota = await ensureCommercialQuota(user.id, plan, 'day');
    const quotaResponse = formatCommercialQuotaResponse(quota, plan);

    return NextResponse.json({
      success: true,
      quota: quotaResponse.legacy,
      commercial: quotaResponse.commercial,
      canMakeRequest: quotaResponse.canMakeRequest,
    });
  } catch (error) {
    logger.error('Get quota error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to get quota' }, { status: 500 });
  }
}
