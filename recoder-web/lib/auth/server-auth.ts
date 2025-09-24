/**
 * Server-only authentication utilities 
 * This module can only be imported in server components and API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { AuthUser, AuthSession } from './types';

export class ServerAuth {
  private static readonly SESSION_COOKIE = 'recoder-session';

  /**
   * Validate session from middleware
   */
  static async validateSession(request: NextRequest): Promise<AuthSession | null> {
    try {
      const sessionToken = request.cookies.get(this.SESSION_COOKIE)?.value;
      
      if (!sessionToken) {
        return null;
      }

      // Decode and validate JWT token (simplified approach)
      const session = await this.decodeSessionToken(sessionToken);
      
      if (!session || new Date(session.expires) < new Date()) {
        return null;
      }

      return session;
    } catch (error) {
      console.error('Session validation failed:', error);
      return null;
    }
  }

  /**
   * Create session token
   */
  static async createSessionToken(user: AuthUser, expiresIn: string = '30d'): Promise<string> {
    const expirationDate = new Date();
    const days = parseInt(expiresIn.replace('d', ''));
    expirationDate.setDate(expirationDate.getDate() + days);

    const session: AuthSession = {
      user,
      expires: expirationDate.toISOString(),
      sessionToken: this.generateSecureToken()
    };

    // Simple base64 encoding (in production, use proper JWT)
    return Buffer.from(JSON.stringify(session)).toString('base64');
  }

  /**
   * Decode session token
   */
  private static async decodeSessionToken(token: string): Promise<AuthSession | null> {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      return JSON.parse(decoded) as AuthSession;
    } catch {
      return null;
    }
  }

  /**
   * Generate secure token
   */
  private static generateSecureToken(): string {
    return Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * Set session cookie
   */
  static setSessionCookie(response: NextResponse, sessionToken: string): void {
    response.cookies.set({
      name: this.SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });
  }

  /**
   * Clear session cookie
   */
  static clearSessionCookie(response: NextResponse): void {
    response.cookies.delete(this.SESSION_COOKIE);
  }

  /**
   * Check if user has required plan access
   */
  static hasAccess(session: AuthSession, requiredPlan: AuthUser['plan']): boolean {
    const planHierarchy: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
    const userLevel = planHierarchy[session.user.plan || 'FREE'] ?? 0;
    const requiredLevel = planHierarchy[requiredPlan || 'FREE'] ?? 0;
    return userLevel >= requiredLevel;
  }
}

// Server-side auth utilities for server components
export async function getServerSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = cookies();
    const sessionToken = (await cookieStore).get(ServerAuth['SESSION_COOKIE'])?.value;
    
    if (!sessionToken) {
      return null;
    }

    return ServerAuth['decodeSessionToken'](sessionToken);
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<AuthSession> {
  const session = await getServerSession();
  if (!session) {
    throw new Error('Authentication required');
  }
  return session;
}

export async function requirePlan(requiredPlan: AuthUser['plan']): Promise<AuthSession> {
  const session = await requireAuth();
  if (!ServerAuth.hasAccess(session, requiredPlan)) {
    throw new Error(`${requiredPlan} plan required`);
  }
  return session;
}

export default ServerAuth;