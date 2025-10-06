/**
 * API Key Generation Endpoint
 * POST /api/auth/keys/generate - Generate new API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaHelpers } from '@/lib/prisma';
import { z } from 'zod';

const generateKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  scopes: z.array(z.string()).default(['cli:full', 'profile']),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = generateKeySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request', 
        details: validation.error.errors 
      }, { status: 400 });
    }

    const { name, scopes } = validation.data;

    // Generate API key
    const { keyId, apiKey } = await prismaHelpers.createApiKey(
      session.user.id as string,
      name,
      scopes
    );

    return NextResponse.json({ 
      success: true,
      keyId,
      apiKey,
      message: 'API key generated successfully'
    });

  } catch (error) {
    console.error('Failed to generate API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
