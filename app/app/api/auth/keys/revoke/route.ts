/**
 * API Key Revocation Endpoint
 * POST /api/auth/keys/revoke - Revoke an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const revokeKeySchema = z.object({
  keyId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = revokeKeySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request',
        details: validation.error.errors 
      }, { status: 400 });
    }

    const { keyId } = validation.data;

    // Verify key belongs to user and revoke it
    const key = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId: session.user.id as string,
      },
    });

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error) {
    console.error('Failed to revoke API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
