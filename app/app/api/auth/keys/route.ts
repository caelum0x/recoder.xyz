/**
 * API Keys List Endpoint
 * GET /api/auth/keys - List user's API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    
    if (authResult.error) {
      return authResult.response;
    }

    const { user } = authResult;

    const keys = await prisma.api_keys.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        usageCount: true,
        isActive: true,
      },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    logger.error('Failed to fetch API keys:', { error: String(error), route: 'auth/keys' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
