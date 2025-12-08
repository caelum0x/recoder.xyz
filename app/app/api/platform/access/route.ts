import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

interface PlatformAccessRequest {
  platform: 'web' | 'chat' | 'cli' | 'extension';
  userId?: string;
  redirect?: string;
}

const PLATFORM_URLS = {
  web: process.env.RECODER_WEB_URL || 'http://localhost:3009',
  chat: process.env.RECODER_CHAT_URL || 'http://localhost:3008',
  cli: '/cli',
  extension: '/extension'
};

export async function POST(request: NextRequest) {
  try {
    // Get session from Better-auth
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body: PlatformAccessRequest = await request.json();
    const { platform } = body;

    if (!platform || !PLATFORM_URLS[platform]) {
      return NextResponse.json(
        { error: 'Invalid platform' },
        { status: 400 }
      );
    }

    // Get the session token from cookies (using correct prefix)
    const cookies = request.headers.get('cookie') || '';
    const tokenMatch = cookies.match(/recoder\.session_token=([^;]+)/);
    const sessionToken = tokenMatch ? tokenMatch[1] : '';

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token found' },
        { status: 401 }
      );
    }

    // Return platform access info with Better-auth session token
    return NextResponse.json({
      success: true,
      platform: platform,
      accessUrl: PLATFORM_URLS[platform],
      token: sessionToken,
      redirectUrl: body.redirect || PLATFORM_URLS[platform],
      message: `Access granted to Recoder ${platform.toUpperCase()}`,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      }
    });

  } catch (error) {
    console.error('Platform Access Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  
  if (!platform || !PLATFORM_URLS[platform as keyof typeof PLATFORM_URLS]) {
    return NextResponse.json(
      { error: 'Invalid platform' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    platform: platform,
    url: PLATFORM_URLS[platform as keyof typeof PLATFORM_URLS],
    available: true,
    requiresAuth: true
  });
}