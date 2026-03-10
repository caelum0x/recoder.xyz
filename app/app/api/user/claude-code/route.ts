/**
 * Claude Code OAuth Token Management
 * For storing user's Claude Code OAuth token (from `claude setup-token`)
 * This allows users to use their own Claude Pro/Max subscription in containers
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { requireAuth } from '@/lib/auth-helpers';

// Validate Claude Code OAuth token format
function isValidClaudeCodeToken(token: string): boolean {
  // Claude Code OAuth tokens start with 'sk-ant-oat01-'
  return token.startsWith('sk-ant-oat01-') && token.length > 50;
}

function userModel() {
  return prisma.user;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    const { userId, token } = await request.json();
    const effectiveUserId = user.id;

    if (!token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (userId && userId !== effectiveUserId) {
      return NextResponse.json({ error: 'Forbidden: userId mismatch' }, { status: 403 });
    }

    // Validate token format
    if (!isValidClaudeCodeToken(token)) {
      return NextResponse.json({
        error: 'Invalid Claude Code token format. Token should start with sk-ant-oat01-'
      }, { status: 400 });
    }

    // Check if user exists (web users use 'user' table)
    const existingUser = await userModel().findUnique({ where: { id: effectiveUserId } });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Encrypt token before storing
    const encrypted = encryptApiKey(token);

    // Update user
    await userModel().update({
      where: { id: effectiveUserId },
      data: {
        claudeCodeToken: encrypted,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Claude Code token saved successfully. Valid for 1 year.'
    });
  } catch {
    return NextResponse.json({ error: 'Failed to save Claude Code token' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    const requestedUserId = request.nextUrl.searchParams.get('userId');
    const effectiveUserId = user.id;
    if (requestedUserId && requestedUserId !== effectiveUserId) {
      return NextResponse.json({ error: 'Forbidden: userId mismatch' }, { status: 403 });
    }

    const dbUser = await userModel().findUnique({
      where: { id: effectiveUserId },
      select: {
        claudeCodeToken: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const claudeToken = dbUser.claudeCodeToken as string | null | undefined;

    let tokenMasked: string | null = null;
    if (claudeToken) {
      try {
        const decrypted = decryptApiKey(claudeToken);
        tokenMasked = `${decrypted.slice(0, 13)}...${decrypted.slice(-4)}`;
      } catch {
        // If decryption fails, show a generic indicator instead of leaking ciphertext
        tokenMasked = 'sk-ant-oat01-****';
      }
    }

    return NextResponse.json({
      hasToken: !!claudeToken,
      tokenMasked,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get token status' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    const requestedUserId = request.nextUrl.searchParams.get('userId');
    const effectiveUserId = user.id;
    if (requestedUserId && requestedUserId !== effectiveUserId) {
      return NextResponse.json({ error: 'Forbidden: userId mismatch' }, { status: 403 });
    }

    await userModel().update({
      where: { id: effectiveUserId },
      data: {
        claudeCodeToken: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Claude Code token removed successfully'
    });
  } catch {
    return NextResponse.json({ error: 'Failed to remove Claude Code token' }, { status: 500 });
  }
}

/**
 * Internal endpoint to get decrypted token for container injection
 * This should only be called by the docker-backend service
 */
export async function PUT(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: { userId?: string } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const authResult = verifyInternalServiceRequest(request, { rawBody });
    if (!authResult.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await userModel().findUnique({
      where: { id: userId },
      select: {
        claudeCodeToken: true,
      },
    });
    const claudeToken = user?.claudeCodeToken as string | null | undefined;

    if (!user || !claudeToken) {
      return NextResponse.json({
        hasToken: false,
        token: null
      });
    }

    // Decrypt token for container use
    const decrypted = decryptApiKey(claudeToken);

    return NextResponse.json({
      hasToken: true,
      token: decrypted,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}
