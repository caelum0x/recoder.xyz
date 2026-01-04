/**
 * Claude Code OAuth Token Management
 * For storing user's Claude Code OAuth token (from `claude setup-token`)
 * This allows users to use their own Claude Pro/Max subscription in containers
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';

// Validate Claude Code OAuth token format
function isValidClaudeCodeToken(token: string): boolean {
  // Claude Code OAuth tokens start with 'sk-ant-oat01-'
  return token.startsWith('sk-ant-oat01-') && token.length > 50;
}

export async function POST(request: NextRequest) {
  try {
    const { userId, token } = await request.json();

    if (!userId || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate token format
    if (!isValidClaudeCodeToken(token)) {
      return NextResponse.json({
        error: 'Invalid Claude Code token format. Token should start with sk-ant-oat01-'
      }, { status: 400 });
    }

    // Check if user exists (web users use 'user' table)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Encrypt token before storing
    const encrypted = encryptApiKey(token);

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        claudeCodeToken: encrypted,
        updatedAt: new Date(),
      },
    });

    console.log(`[Claude Code] Token saved for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Claude Code token saved successfully. Valid for 1 year.'
    });
  } catch (error: any) {
    console.error('Save Claude Code token error:', error);
    return NextResponse.json({ error: 'Failed to save Claude Code token' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        claudeCodeToken: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      hasToken: !!user.claudeCodeToken,
      tokenMasked: user.claudeCodeToken ? `sk-ant-oat01-...${user.claudeCodeToken.slice(-8)}` : null,
    });
  } catch (error: any) {
    console.error('Get Claude Code token status error:', error);
    return NextResponse.json({ error: 'Failed to get token status' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        claudeCodeToken: null,
        updatedAt: new Date(),
      },
    });

    console.log(`[Claude Code] Token removed for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Claude Code token removed successfully'
    });
  } catch (error: any) {
    console.error('Delete Claude Code token error:', error);
    return NextResponse.json({ error: 'Failed to remove Claude Code token' }, { status: 500 });
  }
}

/**
 * Internal endpoint to get decrypted token for container injection
 * This should only be called by the docker-backend service
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId, serviceKey } = await request.json();

    // Verify this is an internal service call
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;
    if (!expectedKey || serviceKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        claudeCodeToken: true,
      },
    });

    if (!user || !user.claudeCodeToken) {
      return NextResponse.json({
        hasToken: false,
        token: null
      });
    }

    // Decrypt token for container use
    const decrypted = decryptApiKey(user.claudeCodeToken);

    return NextResponse.json({
      hasToken: true,
      token: decrypted,
    });
  } catch (error: any) {
    console.error('Get decrypted Claude Code token error:', error);
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}
