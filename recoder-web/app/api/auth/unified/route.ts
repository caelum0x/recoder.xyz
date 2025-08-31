import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authOptions } from '@/lib/auth';
import { unifiedAuth } from '@/lib/unified-auth';
import { prisma } from '@/lib/prisma';

// Generate API Key
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { scopes = ['basic'], restrictions = {}, name } = body;

    // Validate scopes
    const validScopes = ['basic', 'chat', 'generate', 'deploy', 'admin'];
    const invalidScopes = scopes.filter((scope: string) => !validScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return NextResponse.json({ 
        error: 'Invalid scopes', 
        invalidScopes 
      }, { status: 400 });
    }

    const result = await unifiedAuth.generateAPIKey(session.user.id, {
      scopes,
      restrictions,
      name
    });

    // Log the API key generation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'api_key_generated',
        platform: 'web',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          keyId: result.keyId,
          scopes,
          restrictions
        }
      }
    });

    return NextResponse.json({
      keyId: result.keyId,
      apiKey: result.apiKey,
      scopes,
      restrictions
    });
  } catch (error) {
    console.error('API key generation error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate API key' 
    }, { status: 500 });
  }
}

// Get user's API keys
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: session.user.id,
        active: true
      },
      select: {
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        lastUsed: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error('API keys fetch error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch API keys' 
    }, { status: 500 });
  }
}

// Revoke API key
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('keyId');

    if (!keyId) {
      return NextResponse.json({ error: 'Missing keyId' }, { status: 400 });
    }

    // Verify ownership and revoke
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyId,
        userId: session.user.id
      }
    });

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await prisma.apiKey.update({
      where: { keyId },
      data: { active: false }
    });

    // Log the revocation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'api_key_revoked',
        platform: 'web',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: { keyId }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API key revocation error:', error);
    return NextResponse.json({ 
      error: 'Failed to revoke API key' 
    }, { status: 500 });
  }
}