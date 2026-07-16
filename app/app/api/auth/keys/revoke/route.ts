/**
 * API Key Revocation Endpoint
 * POST /api/auth/keys/revoke - Revoke an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const revokeKeySchema = z.object({
  keyId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = revokeKeySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid request'
      }, { status: 400 });
    }

    const { keyId } = validation.data;

    // Verify key belongs to user and revoke it
    const key = await prisma.api_keys.findFirst({
      where: {
        id: keyId,
        userId: user.id as string,
      },
    });

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await prisma.api_keys.update({
      where: { id: key.id },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error) {
    logger.error('Failed to revoke API key:', { error: String(error), route: 'auth/keys/revoke' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
