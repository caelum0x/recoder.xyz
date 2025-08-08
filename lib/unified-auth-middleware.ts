/**
 * Unified Authentication Middleware
 * Works across Web Platform (port 3000) and Chat Platform (port 3001)
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export interface UnifiedUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  platform: 'web' | 'chat';
  subscription?: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'cancelled' | 'expired';
    expiresAt?: string;
  };
  permissions: string[];
  createdAt: string;
  lastActiveAt: string;
}

export interface UnifiedSession {
  user: UnifiedUser;
  platformToken: string;
  unifiedToken: string;
  expiresAt: string;
  createdAt: string;
}

export class UnifiedAuthService {
  private static instance: UnifiedAuthService;
  private jwtSecret: string;
  private sessions: Map<string, UnifiedSession> = new Map();

  constructor() {
    this.jwtSecret = process.env.UNIFIED_AUTH_SECRET || 'recoder-unified-secret';
  }

  static getInstance(): UnifiedAuthService {
    if (!UnifiedAuthService.instance) {
      UnifiedAuthService.instance = new UnifiedAuthService();
    }
    return UnifiedAuthService.instance;
  }

  /**
   * Create a unified session that works across platforms
   */
  async createUnifiedSession(user: Partial<UnifiedUser>, platform: 'web' | 'chat'): Promise<UnifiedSession> {
    const userId = user.id || `user_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const unifiedUser: UnifiedUser = {
      id: userId,
      email: user.email || '',
      name: user.name,
      avatar: user.avatar,
      platform,
      subscription: user.subscription || {
        plan: 'free',
        status: 'active'
      },
      permissions: user.permissions || ['read', 'write'],
      createdAt: user.createdAt || now.toISOString(),
      lastActiveAt: now.toISOString()
    };

    // Generate tokens
    const unifiedToken = this.generateUnifiedToken(unifiedUser);
    const platformToken = this.generatePlatformToken(unifiedUser, platform);

    const session: UnifiedSession = {
      user: unifiedUser,
      platformToken,
      unifiedToken,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString()
    };

    // Store session
    this.sessions.set(userId, session);
    this.sessions.set(unifiedToken, session);

    return session;
  }

  /**
   * Validate unified token across platforms
   */
  async validateUnifiedSession(token: string): Promise<UnifiedSession | null> {
    try {
      // Check in-memory sessions first
      if (this.sessions.has(token)) {
        const session = this.sessions.get(token)!;
        if (new Date(session.expiresAt) > new Date()) {
          return session;
        }
        // Clean up expired session
        this.sessions.delete(token);
        this.sessions.delete(session.user.id);
      }

      // Validate JWT
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      if (decoded.userId) {
        return this.sessions.get(decoded.userId) || null;
      }

      return null;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Cross-platform user sync
   */
  async syncUserAcrossPlatforms(userId: string, updates: Partial<UnifiedUser>): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    // Update user data
    Object.assign(session.user, updates, {
      lastActiveAt: new Date().toISOString()
    });

    // Regenerate tokens if needed
    if (updates.permissions || updates.subscription) {
      session.unifiedToken = this.generateUnifiedToken(session.user);
      session.platformToken = this.generatePlatformToken(session.user, session.user.platform);
    }

    this.sessions.set(userId, session);
    this.sessions.set(session.unifiedToken, session);
  }

  /**
   * Generate unified JWT token
   */
  private generateUnifiedToken(user: UnifiedUser): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        platform: user.platform,
        permissions: user.permissions,
        subscription: user.subscription,
        type: 'unified'
      },
      this.jwtSecret,
      { 
        expiresIn: '30d',
        issuer: 'recoder.xyz',
        audience: ['web', 'chat', 'api', 'cli']
      }
    );
  }

  /**
   * Generate platform-specific token
   */
  private generatePlatformToken(user: UnifiedUser, platform: 'web' | 'chat'): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        platform,
        type: 'platform'
      },
      this.jwtSecret,
      { 
        expiresIn: '7d',
        issuer: `recoder-${platform}`,
        audience: platform
      }
    );
  }

  /**
   * Logout from all platforms
   */
  async logout(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      this.sessions.delete(userId);
      this.sessions.delete(session.unifiedToken);
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    let count = 0;
    for (const [key, session] of this.sessions) {
      if (key.startsWith('user_') && new Date(session.expiresAt) > new Date()) {
        count++;
      }
    }
    return count;
  }
}

/**
 * Middleware for Web Platform (Next.js)
 */
export async function unifiedAuthMiddleware(request: NextRequest): Promise<NextResponse | void> {
  const authService = UnifiedAuthService.getInstance();
  
  // Skip auth for public routes
  const publicRoutes = ['/login', '/register', '/api/auth', '/', '/pricing'];
  if (publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
    return;
  }

  // Get token from multiple sources
  let token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token) {
    token = request.cookies.get('unified-auth-token')?.value;
  }

  if (!token) {
    token = request.cookies.get('next-auth.session-token')?.value;
  }

  if (!token) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Validate session
  const session = await authService.validateUnifiedSession(token);
  
  if (!session) {
    // Invalid session, redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    const response = NextResponse.redirect(loginUrl);
    
    // Clear invalid cookies
    response.cookies.delete('unified-auth-token');
    response.cookies.delete('next-auth.session-token');
    
    return response;
  }

  // Add user info to request headers
  const response = NextResponse.next();
  response.headers.set('x-user-id', session.user.id);
  response.headers.set('x-user-email', session.user.email);
  response.headers.set('x-user-platform', session.user.platform);
  response.headers.set('x-user-subscription', JSON.stringify(session.user.subscription));

  return response;
}

/**
 * Auth helper for React components
 */
export function useUnifiedAuth() {
  const [user, setUser] = useState<UnifiedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          setUser(session.user);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    
    if (response.ok) {
      const session = await response.json();
      setUser(session.user);
      
      // Set unified cookie
      document.cookie = `unified-auth-token=${session.unifiedToken}; path=/; max-age=${30 * 24 * 60 * 60}`;
      
      return session;
    }
    
    throw new Error('Login failed');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    
    // Clear cookies
    document.cookie = 'unified-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    document.cookie = 'next-auth.session-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    
    window.location.href = '/login';
  };

  return {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  };
}

// React import for useState and useEffect
import { useState, useEffect } from 'react';

export default UnifiedAuthService;