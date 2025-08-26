// Session sync for Chat Platform - connects to main recoder.xyz authentication
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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
        // Decode the sync token from main recoder.xyz
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'bb3be4bcc274377e8cc42c190f8eed10df5441d4308ad53045ff01ab5119177f') as any;
        
        if (decoded && decoded.userId && decoded.email) {
          // Create session for chat platform
          const response = NextResponse.redirect(new URL('/', request.url));
          
          // Set chat platform session cookie
          response.cookies.set('chat_session', JSON.stringify({
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name || decoded.email.split('@')[0],
            provider: 'recoder-main',
            authenticated: true,
            expiresAt: decoded.expiresAt
          }), {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 days
          });

          return response;
        }
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError);
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