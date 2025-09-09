/**
 * Session Management API Endpoints
 * Provides REST API for unified session management across platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/lib/sync/session-manager';
import { auth } from '@/lib/auth/unified-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'list':
        // Get all active sessions for the user
        const sessions = await sessionManager.getUserSessions(session.user.id);
        return NextResponse.json({ sessions });

      case 'current':
        // Get current session info
        const sessionId = request.headers.get('x-session-id');
        if (!sessionId) {
          return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
        }
        
        const currentSession = await sessionManager.getSession(sessionId);
        return NextResponse.json({ session: currentSession });

      case 'events':
        // Get session events
        const limit = parseInt(searchParams.get('limit') || '50');
        const events = await sessionManager.getSessionEvents(session.user.id, limit);
        return NextResponse.json({ events });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'create':
        // Create new session
        const newSession = await sessionManager.createSession(
          session.user.id,
          data.platform,
          {
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            userAgent: request.headers.get('user-agent') || '',
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            location: data.location,
            capabilities: data.capabilities || [],
          }
        );
        return NextResponse.json({ session: newSession });

      case 'update':
        // Update session activity
        const sessionId = request.headers.get('x-session-id');
        if (!sessionId) {
          return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
        }
        
        await sessionManager.updateSessionActivity(sessionId, data.metadata);
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const all = searchParams.get('all') === 'true';

    if (all) {
      // Destroy all sessions except current
      const currentSessionId = request.headers.get('x-session-id');
      await sessionManager.destroyUserSessions(session.user.id, currentSessionId || undefined);
      return NextResponse.json({ success: true, message: 'All sessions destroyed' });
    } else if (sessionId) {
      // Destroy specific session
      await sessionManager.destroySession(sessionId);
      return NextResponse.json({ success: true, message: 'Session destroyed' });
    } else {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
