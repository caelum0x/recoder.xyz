/**
 * Active Sessions API
 * GET - Fetch user's active sessions
 * DELETE - Revoke a specific session
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UAParser } from 'ua-parser-js';
import { assertAuthSessionsListResponse } from '@/lib/contracts/auth-session-contracts';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        assertAuthSessionsListResponse({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      );
    }

    // Get all active sessions for the user from both tables
    const [appSessions, baSessions] = await Promise.all([
      prisma.sessions.findMany({
        where: { userId: session.user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.session.findMany({
        where: { userId: session.user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Deduplicate by token
    const seenTokens = new Set<string>();
    const allSessions = [...appSessions, ...baSessions].filter(s => {
      if (seenTokens.has(s.token)) return false;
      seenTokens.add(s.token);
      return true;
    });

    // Parse user agent and IP for each session
    const sessionsWithInfo = allSessions.map(sess => {
      const parser = new UAParser(sess.userAgent || '');
      const browser = parser.getBrowser();
      const os = parser.getOS();
      const device = parser.getDevice();

      return {
        id: sess.id,
        device: `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`,
        browser: browser.name || 'Unknown',
        os: os.name || 'Unknown',
        deviceType: device.type || 'desktop',
        ipAddress: sess.ipAddress || 'Unknown',
        location: 'Unknown',
        lastActive: sess.updatedAt || sess.createdAt,
        createdAt: sess.createdAt,
        current: false // Cannot determine current session without session ID
      };
    });

    return NextResponse.json(assertAuthSessionsListResponse({
      success: true,
      sessions: sessionsWithInfo
    }));

  } catch (error) {
    logger.error('[Sessions GET] Error:', { error: String(error), route: 'auth/sessions' });
    return NextResponse.json(
      assertAuthSessionsListResponse({ success: false, error: 'Failed to fetch sessions' }),
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        assertAuthSessionsListResponse({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json(
        assertAuthSessionsListResponse({ success: false, error: 'Session ID required' }),
        { status: 400 }
      );
    }

    // Verify the session belongs to the user (check both tables)
    const sessionToDelete = await prisma.sessions.findUnique({ where: { id: sessionId } })
      ?? await prisma.session.findUnique({ where: { id: sessionId } });

    if (!sessionToDelete || sessionToDelete.userId !== session.user.id) {
      return NextResponse.json(
        assertAuthSessionsListResponse({ success: false, error: 'Session not found or unauthorized' }),
        { status: 404 }
      );
    }

    // Delete the session from whichever table it's in
    try { await prisma.sessions.delete({ where: { id: sessionId } }); } catch {
      await prisma.session.delete({ where: { id: sessionId } });
    }

    return NextResponse.json(assertAuthSessionsListResponse({
      success: true,
      message: 'Session revoked successfully'
    }));

  } catch (error) {
    logger.error('[Sessions DELETE] Error:', { error: String(error), route: 'auth/sessions' });
    return NextResponse.json(
      assertAuthSessionsListResponse({ success: false, error: 'Failed to revoke session' }),
      { status: 500 }
    );
  }
}
