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

    const rows = await prisma.api_keys.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        permissions: true,
        createdAt: true,
        lastUsedAt: true,
        usageCount: true,
        isActive: true,
      },
    });

    // Map DB field names to what the frontend expects
    const keys = rows.map(row => ({
      id: row.id,
      keyId: row.id,
      keyPrefix: row.keyPrefix,
      name: row.name,
      scopes: row.permissions ?? [],
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      usageCount: row.usageCount,
      isActive: row.isActive,
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    logger.error('Failed to fetch API keys:', { error: String(error), route: 'auth/keys' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
