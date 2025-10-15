import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionStats } from '@/lib/session-management';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

async function authenticateRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.substring(7);
  const decoded = verify(token, JWT_SECRET) as any;
  return decoded.userId;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);
    
    const user = await prisma.user.findUnique({
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
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        hasOwnApiKey: user.hasOwnApiKey,
        onboardingStep: user.onboardingStep
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
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);
    const { name, preferredModels } = await request.json();
    
    await prisma.user.update({
      where: { id: userId },
      data: { name, preferredModels }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
