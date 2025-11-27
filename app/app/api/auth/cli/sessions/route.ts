import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { CLIAuthService } from '@/lib/services/cli-auth.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/cli/sessions
 * List all CLI sessions for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const sessions = await CLIAuthService.listUserSessions(user.id);

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error: any) {
    console.error('List sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/cli/sessions/:sessionId
 * Revoke a CLI session
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400 }
      );
    }

    const result = await CLIAuthService.revokeSession(sessionId, user.id);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Revoke session error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke session', message: error.message },
      { status: 500 }
    );
  }
}
