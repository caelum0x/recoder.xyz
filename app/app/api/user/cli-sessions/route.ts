/**
 * GET/DELETE /api/user/cli-sessions
 *
 * Session-authenticated device/session management for the /account page.
 * Every query is owner-scoped (WHERE userId) so one user can never see or
 * revoke another user's sessions. Responses expose a short token prefix
 * only — never access/refresh token material.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { cliTokenPrefix } from '@/app/[locale]/account/account-view';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await prisma.cli_sessions.findMany({
      where: { userId: user.id },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        accessToken: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      sessions: sessions.map(({ accessToken, ...safe }) => ({
        ...safe,
        tokenPrefix: cliTokenPrefix(accessToken),
      })),
    });
  } catch (error) {
    logger.error('cli-sessions list failed', { error: String(error) });
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
    }

    // Owner-scoped lookup: someone else's session id is indistinguishable
    // from a nonexistent one (404, never 403 — no existence oracle).
    const session = await prisma.cli_sessions.findFirst({
      where: { id, userId: user.id },
      select: { id: true, revokedAt: true, isActive: true },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Idempotent: revoking an already-revoked session is still a success.
    if (!session.revokedAt || session.isActive) {
      await prisma.cli_sessions.update({
        where: { id: session.id },
        data: { isActive: false, revokedAt: session.revokedAt ?? new Date() },
      });
    }

    return NextResponse.json({ success: true, revoked: true, id: session.id });
  } catch (error) {
    logger.error('cli-sessions revoke failed', { error: String(error) });
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
