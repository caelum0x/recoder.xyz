import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionStats } from '@/lib/session-management';
import { getUserIdFromBearerAuthHeader } from '@/lib/auth/jwt-auth';

async function authenticateRequest(request: NextRequest): Promise<string> {
  return getUserIdFromBearerAuthHeader(request.headers.get('authorization'));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);

    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const sessionStats = await getSessionStats(userId);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription,
        role: user.role
      },
      sessions: {
        today: sessionStats.sessionsToday,
        limit: sessionStats.sessionsLimit,
        remaining: sessionStats.remainingSessions
      },
      premiumTokens: {
        today: sessionStats.premiumTokensToday,
        limit: sessionStats.premiumTokensLimit,
        remaining: sessionStats.remainingPremiumTokens
      },
      activeSession: sessionStats.activeSession
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);
    const { name } = await request.json();

    await prisma.users.update({
      where: { id: userId },
      data: {
        name,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (_error: unknown) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
