// User profile API endpoint
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to extract user from Bearer token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  // Find session by access token
  const session = await prisma.cLISession.findUnique({
    where: { accessToken: token },
    include: { user: true }
  });

  if (!session || !session.isActive || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user with quota information
    const userWithQuota = await prisma.user.findUnique({
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

    return NextResponse.json({
      success: true,
      user: {
        id: userWithQuota.id,
        email: userWithQuota.email,
        name: userWithQuota.name,
        subscriptionPlan: userWithQuota.subscriptionPlan,
        subscriptionStatus: userWithQuota.subscriptionStatus,
        hasOwnApiKey: userWithQuota.hasOwnApiKey,
        onboardingStep: userWithQuota.onboardingStep,
        createdAt: userWithQuota.createdAt,
        quota: userWithQuota.quota ? {
          sessionsPerDay: userWithQuota.quota.sessionsPerDay,
          sessionsUsedToday: userWithQuota.quota.sessionsUsedToday,
          tokensPerSession: userWithQuota.quota.tokensPerSession,
          remaining: userWithQuota.quota.sessionsPerDay - userWithQuota.quota.sessionsUsedToday
        } : null
      }
    });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const updates = await request.json();
    
    // Validate allowed fields
    const allowedFields = ['name', 'username', 'bio', 'location', 'company', 'avatar_url'];
    const validUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    const success = await userManager.updateUserProfile(session.user.id, validUpdates);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Return updated profile
    const profile = await userManager.getUserProfile(session.user.id);
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}