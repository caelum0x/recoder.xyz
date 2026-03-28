import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { logger } from '@/lib/logger';

interface PlatformAccessRequest {
  platform: 'web' | 'frontend' | 'studio' | 'pm' | 'agency' | 'cli' | 'extension';
  userId?: string;
  redirect?: string;
}

const PLATFORM_URLS: Record<string, string> = {
  web: process.env.RECODER_WEB_URL || (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173'),
  frontend: process.env.RECODER_FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://agents.recoder.xyz' : 'http://localhost:3001'),
  studio: process.env.RECODER_STUDIO_URL || (process.env.NODE_ENV === 'production' ? 'https://agency.recoder.xyz' : 'http://localhost:3007'),
  pm: process.env.RECODER_PM_URL || (process.env.NODE_ENV === 'production' ? 'https://pm.recoder.xyz' : 'http://localhost:3004'),
  agency: process.env.RECODER_AGENCY_URL || (process.env.NODE_ENV === 'production' ? 'https://agency.recoder.xyz' : 'http://localhost:3007'),
  cli: '/cli',
  extension: '/extension',
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
    logger.error('Platform access error', { route: 'api/platform/access', error: error instanceof Error ? error.message : String(error) });
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