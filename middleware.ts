/**
 * Next.js Middleware for Cross-Platform Session Synchronization
 * Handles authentication and session sync across all Recoder platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { SessionSyncManager } from '@/lib/session-sync';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionSync = SessionSyncManager.getInstance();

  // Handle session sync requests
  if (pathname.startsWith('/api/auth/sync')) {
    return NextResponse.next();
  }

  // Handle platform access pages
  if (pathname.startsWith('/platform/')) {
    const platformType = pathname.split('/')[2]; // web, chat, etc.
    
    // Check for synchronized session
    const syncedSession = sessionSync.extractSessionFromRequest(request);
    
    if (syncedSession) {
      // Add session data to request headers for platform access
      const response = NextResponse.next();
      response.headers.set('x-synced-session', JSON.stringify(syncedSession));
      response.headers.set('x-platform-type', platformType);
      return response;
    }
  }

  // Handle dashboard access - require authentication
  if (pathname === '/dashboard') {
    const syncedSession = sessionSync.extractSessionFromRequest(request);
    
    if (!syncedSession) {
      // Redirect to sign in if no session
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('return', '/dashboard');
      return NextResponse.redirect(signInUrl);
    }
  }

  // Handle authentication pages when already logged in
  if (pathname.startsWith('/auth/signin') || pathname.startsWith('/auth/register')) {
    const syncedSession = sessionSync.extractSessionFromRequest(request);
    
    if (syncedSession) {
      // Redirect to dashboard if already authenticated
      const returnUrl = request.nextUrl.searchParams.get('return') || '/dashboard';
      return NextResponse.redirect(new URL(returnUrl, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/auth/sync/:path*',
    '/platform/:path*',
    '/dashboard',
    '/auth/signin',
    '/auth/register'
  ]
};