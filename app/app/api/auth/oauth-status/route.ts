/**
 * OAuth Status API
 * Check which OAuth providers the user has connected
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check user's accounts table to see which OAuth providers are connected
    const accounts = await prisma.account.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        providerId: true
      }
    });

    const connectedProviders = {
      github: accounts.some(acc => acc.providerId === 'github'),
      google: accounts.some(acc => acc.providerId === 'google'),
    };

    return NextResponse.json({
      success: true,
      providers: connectedProviders
    });

  } catch (error) {
    logger.error('[OAuth Status] Error:', { error: String(error), route: 'auth/oauth-status' });
    return NextResponse.json(
      { success: false, error: 'Failed to get OAuth status' },
      { status: 500 }
    );
  }
}
