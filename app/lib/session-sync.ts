// Cross-domain session synchronization for Recoder products
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { userDb } from './database';
import { logger } from '@/lib/logger';

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  image?: string;
  plan: string;
  expiresAt: number;
  domains: string[];
}

export class SessionSyncManager {
  private static instance: SessionSyncManager;
  private readonly SYNC_SECRET = process.env.SESSION_SYNC_SECRET || process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  private readonly SYNC_COOKIE_NAME = 'recoder-session-sync';
  private readonly COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

  static getInstance(): SessionSyncManager {
    if (!SessionSyncManager.instance) {
      SessionSyncManager.instance = new SessionSyncManager();
    }
    return SessionSyncManager.instance;
  }

  // Generate cross-domain sync token
  generateSyncToken(sessionData: SessionData): string {
    if (!this.SYNC_SECRET) {
      throw new Error('JWT secret not configured. Please set SESSION_SYNC_SECRET, BETTER_AUTH_SECRET, or JWT_SECRET in environment variables.');
    }

    const payload = {
      ...sessionData,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(sessionData.expiresAt / 1000),
      iss: 'recoder.xyz',
      aud: 'recoder-products'
    };

    return jwt.sign(payload, this.SYNC_SECRET);
  }

  // Generate sync URLs for cross-platform access
  generateSyncUrls(syncToken: string): string[] {
    const domains = [
      'web.recoder.xyz',        // Recoder Web IDE
      'agents.recoder.xyz',     // Recoder Agents
      'frontend.recoder.xyz',   // Legacy alias for agents
      'agency.recoder.xyz',     // AI agent workflows
      'pm.recoder.xyz',         // Project management
    ];

    return domains.map(domain => `https://${domain}/api/auth/sync?token=${encodeURIComponent(syncToken)}`);
  }

  // Get cookie configuration for different platforms
  getCookieConfig(platform: string) {
    return {
      name: this.SYNC_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none' as const,
        maxAge: this.COOKIE_MAX_AGE,
        path: '/',
        domain: '.recoder.xyz'
      }
    };
  }

  // Validate sync token
  validateSyncToken(token: string): { isValid: boolean; data?: SessionData } {
    try {
      const decoded = jwt.verify(token, this.SYNC_SECRET!) as jwt.JwtPayload & SessionData;
      
      return {
        isValid: true,
        data: {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          image: decoded.image,
          plan: decoded.plan,
          expiresAt: decoded.exp * 1000,
          domains: decoded.domains || []
        }
      };
    } catch (error) {
      logger.error('Session sync token validation failed', { error: String(error) });
      return { isValid: false };
    }
  }

  // Create session sync response
  createSyncResponse(sessionData: SessionData, targetDomain?: string): NextResponse {
    const syncToken = this.generateSyncToken(sessionData);
    
    const response = NextResponse.json({
      success: true,
      sessionData,
      syncToken,
      timestamp: Date.now()
    });

    // Set sync cookie for cross-domain access
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none' as const,
      maxAge: this.COOKIE_MAX_AGE,
      path: '/',
      domain: targetDomain || '.recoder.xyz' // Allow all subdomains
    };

    response.cookies.set(this.SYNC_COOKIE_NAME, syncToken, cookieOptions);

    return response;
  }

  // Extract session from request
  extractSessionFromRequest(request: NextRequest): SessionData | null {
    try {
      // Try to get from cookie first
      const cookieToken = request.cookies.get(this.SYNC_COOKIE_NAME)?.value;
      if (cookieToken) {
        const validation = this.validateSyncToken(cookieToken);
        if (validation.isValid && validation.data) {
          return validation.data;
        }
      }

      // Try to get from Authorization header
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const validation = this.validateSyncToken(token);
        if (validation.isValid && validation.data) {
          return validation.data;
        }
      }

      return null;
    } catch (error) {
      logger.error('Session extraction failed', { error: String(error) });
      return null;
    }
  }

  // Sync session across domains
  async syncSessionAcrossDomains(
    sessionData: SessionData,
    currentDomain: string
  ): Promise<{ success: boolean; syncedDomains: string[] }> {
    const recoderDomains = [
      'recoder.xyz',
      'web.recoder.xyz',
      'agents.recoder.xyz',
      'frontend.recoder.xyz',
      'agency.recoder.xyz',
      'pm.recoder.xyz',
    ].filter(domain => domain !== currentDomain);

    const syncResults = await Promise.allSettled(
      recoderDomains.map(domain => this.syncToDomain(sessionData, domain))
    );

    const syncedDomains = syncResults
      .map((result, index) => ({ 
        domain: recoderDomains[index], 
        success: result.status === 'fulfilled' 
      }))
      .filter(result => result.success)
      .map(result => result.domain);

    return {
      success: syncedDomains.length > 0,
      syncedDomains
    };
  }

  // Sync to specific domain
  private async syncToDomain(sessionData: SessionData, domain: string): Promise<boolean> {
    try {
      const syncEndpoint = `https://${domain}/api/auth/sync`;
      const syncToken = this.generateSyncToken(sessionData);

      const response = await fetch(syncEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncToken}`,
          'X-Sync-Origin': 'recoder.xyz'
        },
        body: JSON.stringify({
          action: 'sync_session',
          sessionData,
          timestamp: Date.now()
        })
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to sync session to domain', { domain, error: String(error) });
      return false;
    }
  }

  // Handle logout across domains
  async logoutAcrossDomains(userId: string, currentDomain: string): Promise<void> {
    const recoderDomains = [
      'recoder.xyz',
      'web.recoder.xyz',
      'agents.recoder.xyz',
      'frontend.recoder.xyz',
      'agency.recoder.xyz',
      'pm.recoder.xyz',
    ].filter(domain => domain !== currentDomain);

    const logoutPromises = recoderDomains.map(async (domain) => {
      try {
        const logoutEndpoint = `https://${domain}/api/auth/sync`;
        await fetch(logoutEndpoint, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Sync-Origin': currentDomain
          },
          body: JSON.stringify({
            action: 'logout_session',
            userId,
            timestamp: Date.now()
          })
        });
      } catch (error) {
        logger.error('Failed to logout from domain', { domain, error: String(error) });
      }
    });

    await Promise.allSettled(logoutPromises);
  }

  // Create logout response
  createLogoutResponse(): NextResponse {
    const response = NextResponse.json({
      success: true,
      action: 'logout',
      timestamp: Date.now()
    });

    // Clear sync cookie
    response.cookies.set(this.SYNC_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none' as const,
      maxAge: 0,
      path: '/',
      domain: '.recoder.xyz'
    });

    return response;
  }
}

// Session sync API handler
export async function handleSessionSync(request: NextRequest): Promise<NextResponse> {
  const sessionSync = SessionSyncManager.getInstance();

  try {
    if (request.method === 'POST') {
      // Handle session sync request
      const body = await request.json();
      const { action, sessionData, userId } = body;

      if (action === 'sync_session' && sessionData) {
        // Validate the session data
        const user = await userDb.findById(sessionData.userId);
        if (!user || user.subscription_status !== 'active') {
          return NextResponse.json(
            { error: 'Invalid user' },
            { status: 401 }
          );
        }

        // Create session sync response
        return sessionSync.createSyncResponse(sessionData);
      }

      return NextResponse.json(
        { error: 'Invalid sync action' },
        { status: 400 }
      );
    }

    if (request.method === 'DELETE') {
      // Handle logout sync request
      const body = await request.json();
      const { action, userId } = body;

      if (action === 'logout_session' && userId) {
        return sessionSync.createLogoutResponse();
      }

      return NextResponse.json(
        { error: 'Invalid logout action' },
        { status: 400 }
      );
    }

    if (request.method === 'GET') {
      // Check current session sync status
      const sessionData = sessionSync.extractSessionFromRequest(request);
      
      return NextResponse.json({
        synced: !!sessionData,
        sessionData: sessionData || null,
        timestamp: Date.now()
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  } catch (error) {
    logger.error('Session sync handler error', { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Client-side session sync utilities
export const clientSessionSync = {
  // Check if session is synced across domains
  async checkSyncStatus(): Promise<{ synced: boolean; sessionData?: SessionData }> {
    try {
      const response = await fetch('/api/auth/sync', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      return { synced: false };
    } catch (error) {
      logger.error('Failed to check sync status', { error: String(error) });
      return { synced: false };
    }
  },

  // Trigger session sync
  async triggerSync(sessionData: SessionData): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'sync_session',
          sessionData
        })
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to trigger session sync', { error: String(error) });
      return false;
    }
  },

  // Trigger logout sync
  async triggerLogoutSync(userId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/sync', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'logout_session',
          userId
        })
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to trigger logout sync', { error: String(error) });
      return false;
    }
  }
};

// Export singleton instance
export const sessionSyncManager = SessionSyncManager.getInstance();