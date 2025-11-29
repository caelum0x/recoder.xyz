/**
 * Active Sessions API
 * GET - Fetch user's active sessions
 * DELETE - Revoke a specific session
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { UAParser } from 'ua-parser-js';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all active sessions for the user
    const sessions = await prisma.session.findMany({
      where: {
        userId: session.user.id,
        expiresAt: {
          gt: new Date() // Only active sessions
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Parse user agent and IP for each session
    const sessionsWithInfo = sessions.map(sess => {
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
        location: 'Unknown', // Would need IP geolocation service
        lastActive: sess.updatedAt || sess.createdAt,
        createdAt: sess.createdAt,
        current: sess.id === session.session.id
      };
    });

    return NextResponse.json({
      success: true,
      sessions: sessionsWithInfo
    });

  } catch (error: any) {
    console.error('[Sessions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Verify the session belongs to the user
    const sessionToDelete = await prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!sessionToDelete || sessionToDelete.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Session not found or unauthorized' },
        { status: 404 }
      );
    }

    // Don't allow deleting current session
    if (sessionId === session.session.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot revoke current session. Please sign out instead.' },
        { status: 400 }
      );
    }

    // Delete the session
    await prisma.session.delete({
      where: { id: sessionId }
    });

    return NextResponse.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error: any) {
    console.error('[Sessions DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to revoke session' },
      { status: 500 }
    );
  }
}
