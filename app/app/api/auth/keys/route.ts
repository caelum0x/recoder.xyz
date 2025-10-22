/**
 * API Keys List Endpoint
 * GET /api/auth/keys - List user's API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    
    if (authResult.error) {
      return authResult.response;
    }

    const { user } = authResult;

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
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
