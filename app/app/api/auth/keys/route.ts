/**
 * API Keys List Endpoint
 * GET /api/auth/keys - List user's API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id as string },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyId: true,
        keyPrefix: true,
        name: true,
        description: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        usageCount: true,
        isActive: true,
      },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Failed to fetch API keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
