import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/cli/keys
 * List all API keys for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const keys = await CLIAuthService.listApiKeys(user.id);

    return NextResponse.json({ keys }, { status: 200 });
  } catch (error: any) {
    console.error('List API keys error:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/cli/keys
 * Create new API key
 *
 * Request body:
 * {
 *   "name": "My CLI Key",
 *   "description": "For local development",
 *   "scopes": ["cli:full"],
 *   "expiresAt": "2025-12-31T23:59:59Z" (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, scopes, expiresAt } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const key = await CLIAuthService.createApiKey(
      user.id,
      name,
      description,
      scopes || ['cli:full'],
      expiresAt ? new Date(expiresAt) : undefined
    );

    return NextResponse.json(key, { status: 201 });
  } catch (error: any) {
    console.error('Create API key error:', error);
    return NextResponse.json(
      { error: 'Failed to create API key', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/cli/keys?key_id=key_xxx
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const keyId = url.searchParams.get('key_id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'Missing key_id' },
        { status: 400 }
      );
    }

    const result = await CLIAuthService.revokeApiKey(keyId, user.id);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Revoke API key error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key', message: error.message },
      { status: 500 }
    );
  }
}
