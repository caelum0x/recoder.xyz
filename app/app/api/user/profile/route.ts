// User profile API endpoint
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getUserFromToken } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import { userManager } from '@/lib/user-management';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getCommercialEntitlements, normalizeCommercialPlan } from '@/lib/plan-entitlements';

const apiRateLimiter = rateLimit(rateLimitConfigs.api);

export async function GET(request: NextRequest) {
  const rateLimitResponse = await apiRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserFromToken(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user with quota information
    const userWithQuota = await prisma.users.findUnique({
      where: { id: user.id },
      include: {
        quota: true
      }
    });

    if (!userWithQuota) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const normalizedPlan = normalizeCommercialPlan(userWithQuota.subscriptionPlan || userWithQuota.subscription || 'free');
    const entitlements = getCommercialEntitlements(normalizedPlan);

    return NextResponse.json({
      success: true,
      user: {
        id: userWithQuota.id,
        email: userWithQuota.email,
        name: userWithQuota.name,
        subscriptionPlan: normalizedPlan,
        subscriptionStatus: userWithQuota.subscriptionStatus,
        hasOwnApiKey: userWithQuota.hasOwnApiKey,
        onboardingStep: userWithQuota.onboardingStep,
        createdAt: userWithQuota.createdAt,
        entitlements,
        quota: userWithQuota.quota ? {
          sessionsPerDay: userWithQuota.quota.sessionsPerDay,
          sessionsUsedToday: userWithQuota.quota.sessionsUsedToday,
          tokensPerSession: userWithQuota.quota.tokensPerSession,
          remaining: userWithQuota.quota.sessionsPerDay - userWithQuota.quota.sessionsUsedToday
        } : null
      }
    });
  } catch (error) {
    logger.error('Profile API error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const rateLimitResponse = await apiRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const updates = await request.json();

    // Validate allowed fields and enforce length limits
    const fieldLimits: Record<string, number> = {
      name: 100,
      username: 50,
      bio: 500,
      location: 100,
      company: 200,
      avatar_url: 2048,
    };
    const allowedFields = Object.keys(fieldLimits);
    const validUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (!allowedFields.includes(key)) continue;
      const val = updates[key];
      if (val !== undefined && val !== null) {
        if (typeof val !== 'string') {
          return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
        }
        if (val.length > fieldLimits[key]) {
          return NextResponse.json({ error: `${key} exceeds maximum length of ${fieldLimits[key]}` }, { status: 400 });
        }
      }
      validUpdates[key] = val;
    }

    const success = await userManager.updateUserProfile(user.id, validUpdates);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Return updated profile
    const profile = await userManager.getUserProfile(user.id);
    return NextResponse.json(profile);
  } catch (error) {
    logger.error('Profile update error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
