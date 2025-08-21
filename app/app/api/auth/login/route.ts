/**
 * Enhanced Authentication API Route
 * Handles login requests with cross-platform session synchronization
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { SessionSyncManager, SessionData } from '@/lib/session-sync';

interface LoginRequest {
  email?: string;
  password?: string;
  token?: string;
}

interface UserSession {
  userId: string;
  token: string;
  email: string;
  name?: string;
  plan: 'free' | 'pro' | 'enterprise';
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: string;
  };
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const sessionSync = SessionSyncManager.getInstance();

    // For demonstration, create a mock session
    // In production, this would validate credentials against your auth system
    const userId = 'user-' + Date.now();
    const email = body.email || 'user@recoder.xyz';
    const name = email.split('@')[0];

    const mockSession: UserSession = {
      userId,
      token: jwt.sign({ 
        userId,
        email,
        plan: 'free'
      }, process.env.NEXTAUTH_SECRET || 'development-secret', { expiresIn: '7d' }),
      email,
      name,
      plan: 'free',
      quotas: {
        totalRequests: 1000,
        usedRequests: Math.floor(Math.random() * 150), // Random usage for demo
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      platforms: {
        cli: true,
        web: true,
        extension: true,
        router: true
      }
    };

    // Create session data for cross-platform synchronization
    const sessionData: SessionData = {
      userId,
      email,
      name,
      plan: mockSession.plan,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      domains: ['web.recoder.xyz', 'chat.recoder.xyz', 'recoder.xyz']
    };

    // Generate cross-platform sync token
    const syncToken = sessionSync.generateSyncToken(sessionData);

    // Create response with session sync
    const response = NextResponse.json({
      success: true,
      user: mockSession,
      sessionData,
      crossPlatformAccess: true,
      syncUrls: sessionSync.generateSyncUrls(syncToken)
    });

    // Set cross-platform session cookie
    const cookieConfig = sessionSync.getCookieConfig('main');
    response.cookies.set(cookieConfig.name, syncToken, cookieConfig.options);

    return response;

  } catch (error) {
    console.error('Authentication Error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
}