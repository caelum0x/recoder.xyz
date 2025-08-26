// Session sync for Chat Platform - connects to main recoder.xyz authentication
import { NextRequest, NextResponse } from 'next/server';
import { UnifiedSessionSync } from './unified-session-sync';

export async function handleSessionSync(request: NextRequest): Promise<NextResponse> {
  try {
    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url);
      const token = searchParams.get('token');

      if (!token) {
        return NextResponse.json({
          synced: false,
          sessionData: null,
          error: 'No sync token provided',
          timestamp: Date.now()
        });
      }

      try {
        // Use unified session sync validation (same logic as main site)
        const sessionSync = UnifiedSessionSync.getInstance();
        const validation = sessionSync.validateSyncToken(token);
        
        if (validation.isValid && validation.data) {
          // Create session for chat platform
          const response = NextResponse.redirect(new URL('/', request.url));
          
          // Set chat platform session cookie
          response.cookies.set('chat_session', JSON.stringify({
            userId: validation.data.userId,
            email: validation.data.email,
            name: validation.data.name || validation.data.email.split('@')[0],
            provider: 'recoder-main',
            authenticated: true,
            expiresAt: validation.data.expiresAt
          }), {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 days
          });

          return response;
        }
      } catch (error) {
        console.error('Session sync validation failed:', error);
        return NextResponse.json({
          synced: false,
          error: 'Invalid sync token',
          timestamp: Date.now()
        });
      }
    }

    if (request.method === 'POST') {
      return NextResponse.json({
        success: true,
        message: 'Chat platform session sync completed',
        timestamp: Date.now()
      });
    }

    if (request.method === 'DELETE') {
      return NextResponse.json({
        success: true,
        action: 'logout',
        timestamp: Date.now()
      });
    }

    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  } catch (error) {
    console.error('Session sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}