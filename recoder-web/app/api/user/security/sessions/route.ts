// Session management API endpoint for security settings
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';

interface UserSession {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  isCurrent: boolean;
  isActive: boolean;
  lastActivity: string;
  createdAt: string;
  userAgent: string;
}

interface SessionActivity {
  id: string;
  sessionId: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  details?: any;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'sessions';

    switch (type) {
      case 'sessions':
        return await getUserSessions(session.user.id, request);
      case 'activity':
        return await getSessionActivity(session.user.id, url.searchParams.get('sessionId'));
      default:
        return Response.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Sessions API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, sessionId } = await request.json();

    switch (action) {
      case 'revoke':
        if (!sessionId) {
          return Response.json({ error: 'Session ID is required' }, { status: 400 });
        }
        return await revokeSession(session.user.id, sessionId);
      
      case 'revoke-all':
        return await revokeAllSessions(session.user.id, request);
      
      case 'refresh':
        return await refreshCurrentSession(session.user.id, request);
      
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Session management error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getUserSessions(userId: string, request: NextRequest): Promise<Response> {
  try {
    // Get current session info from headers
    const userAgent = request.headers.get('user-agent') || '';
    const currentIp = getClientIp(request);
    
    // Mock session data - in a real implementation, you'd fetch from database
    const mockSessions: UserSession[] = [
      {
        id: '1',
        userId,
        deviceName: 'MacBook Pro',
        deviceType: 'desktop',
        browser: 'Chrome 119.0.0',
        os: 'macOS 14.1',
        ipAddress: currentIp,
        location: 'San Francisco, CA, US',
        isCurrent: true,
        isActive: true,
        lastActivity: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        userAgent,
      },
      {
        id: '2',
        userId,
        deviceName: 'iPhone 15 Pro',
        deviceType: 'mobile',
        browser: 'Safari 17.1',
        os: 'iOS 17.1',
        ipAddress: '192.168.1.105',
        location: 'San Francisco, CA, US',
        isCurrent: false,
        isActive: true,
        lastActivity: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15',
      },
      {
        id: '3',
        userId,
        deviceName: 'Windows PC',
        deviceType: 'desktop',
        browser: 'Firefox 119.0',
        os: 'Windows 11',
        ipAddress: '203.0.113.1',
        location: 'New York, NY, US',
        isCurrent: false,
        isActive: false,
        lastActivity: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
        createdAt: new Date(Date.now() - 1209600000).toISOString(), // 2 weeks ago
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
      }
    ];

    // Sort by last activity (most recent first)
    mockSessions.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    return Response.json({
      sessions: mockSessions,
      totalSessions: mockSessions.length,
      activeSessions: mockSessions.filter(s => s.isActive).length,
    });
  } catch (error) {
    console.error('Get user sessions error:', error);
    return Response.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

async function getSessionActivity(userId: string, sessionId: string | null): Promise<Response> {
  try {
    if (!sessionId) {
      return Response.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Mock activity data - in a real implementation, you'd fetch from database
    const mockActivity: SessionActivity[] = [
      {
        id: '1',
        sessionId,
        action: 'LOGIN',
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome/119.0.0.0',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        details: { success: true, method: '2fa' },
      },
      {
        id: '2',
        sessionId,
        action: 'PROJECT_ACCESS',
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome/119.0.0.0',
        timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
        details: { projectId: 'proj_123', projectName: 'My React App' },
      },
      {
        id: '3',
        sessionId,
        action: 'SETTINGS_UPDATE',
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome/119.0.0.0',
        timestamp: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
        details: { section: 'profile', changes: ['avatar'] },
      },
    ];

    return Response.json({
      activity: mockActivity,
      sessionId,
    });
  } catch (error) {
    console.error('Get session activity error:', error);
    return Response.json({ error: 'Failed to fetch session activity' }, { status: 500 });
  }
}

async function revokeSession(userId: string, sessionId: string): Promise<Response> {
  try {
    // In a real implementation, you would:
    // 1. Verify the session belongs to the user
    // 2. Mark the session as revoked in the database
    // 3. Add the session to a blacklist or revocation list
    // 4. Log the revocation action

    // For now, we'll just simulate success
    console.log(`Revoking session ${sessionId} for user ${userId}`);

    // Simulate audit logging
    await logSecurityEvent(userId, 'SESSION_REVOKED', {
      sessionId,
      revokedAt: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: 'Session revoked successfully',
      sessionId,
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    return Response.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}

async function revokeAllSessions(userId: string, request: NextRequest): Promise<Response> {
  try {
    const currentSessionId = request.headers.get('x-session-id'); // Assuming session ID in header
    
    // In a real implementation, you would:
    // 1. Get all active sessions for the user
    // 2. Revoke all sessions except the current one (if preserveCurrent is true)
    // 3. Update the database
    // 4. Log the mass revocation

    console.log(`Revoking all sessions for user ${userId}, except current: ${currentSessionId}`);

    // Simulate audit logging
    await logSecurityEvent(userId, 'ALL_SESSIONS_REVOKED', {
      preservedCurrentSession: !!currentSessionId,
      revokedAt: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: 'All other sessions have been revoked',
      revokedCount: 3, // Mock number
    });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    return Response.json({ error: 'Failed to revoke sessions' }, { status: 500 });
  }
}

async function refreshCurrentSession(userId: string, request: NextRequest): Promise<Response> {
  try {
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = getClientIp(request);

    // In a real implementation, you would:
    // 1. Update the session's last activity timestamp
    // 2. Update location/device info if needed
    // 3. Return updated session info

    console.log(`Refreshing session for user ${userId}`);

    const updatedSession = {
      lastActivity: new Date().toISOString(),
      ipAddress,
      userAgent,
    };

    return Response.json({
      success: true,
      message: 'Session refreshed',
      session: updatedSession,
    });
  } catch (error) {
    console.error('Refresh session error:', error);
    return Response.json({ error: 'Failed to refresh session' }, { status: 500 });
  }
}

async function logSecurityEvent(userId: string, action: string, details: any): Promise<void> {
  try {
    // In a real implementation, this would write to a security audit log
    console.log('Security Event:', {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
    });

    // Could also call userManager to log to database
    // await userManager.logSecurityEvent(userId, action, details);
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw here as it shouldn't break the main operation
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const cloudflare = request.headers.get('cf-connecting-ip');
  
  if (cloudflare) return cloudflare;
  if (forwarded) return forwarded.split(',')[0].trim();
  if (real) return real;
  
  return '127.0.0.1'; // Default fallback IP
}

function parseUserAgent(userAgent: string): { browser: string; os: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' } {
  // Simple user agent parsing - in production, use a proper library like ua-parser-js
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
  const isTablet = /iPad|tablet/.test(userAgent);
  
  let browser = 'Unknown';
  let os = 'Unknown';
  
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('iOS')) os = 'iOS';
  else if (userAgent.includes('Android')) os = 'Android';
  
  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  
  return { browser, os, deviceType };
}