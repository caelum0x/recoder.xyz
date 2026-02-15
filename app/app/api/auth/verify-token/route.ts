import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

const SESSION_COOKIE_CANDIDATES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  '__Secure-session_token',
  'session_token',
  'recoder_session_token',
];

function extractTokenFromCookieHeader(cookieHeader: string): string {
  if (!cookieHeader) return '';
  for (const cookieName of SESSION_COOKIE_CANDIDATES) {
    const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return '';
}

function normalizeSessionToken(rawToken: string): string {
  let token = rawToken.trim().replace(/^["']|["']$/g, '');
  if (!token) return '';
  token = token.replace(/^Bearer\s+/i, '').trim();

  for (const cookieName of SESSION_COOKIE_CANDIDATES) {
    const prefix = `${cookieName}=`;
    if (token.startsWith(prefix)) {
      token = token.slice(prefix.length);
      break;
    }
  }

  if (token.includes(';')) {
    token = token.split(';')[0] || token;
  }

  try {
    token = decodeURIComponent(token);
  } catch {
    // keep raw token when not URI-encoded
  }

  return token.trim();
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let parsed: { token?: string } = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const tokenFromBody = parsed.token?.trim() || '';
    const authHeader = request.headers.get('authorization') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const tokenFromBearer = bearerMatch?.[1]?.trim() || '';
    const tokenFromCookie = extractTokenFromCookieHeader(request.headers.get('cookie') || '');
    const token = normalizeSessionToken(tokenFromBody || tokenFromBearer || tokenFromCookie);

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const authResult = verifyInternalServiceRequest(request, { rawBody });
    if (!authResult.ok) {
      return NextResponse.json(
        { error: 'Unauthorized', reason: (authResult as { ok: false; reason: string }).reason },
        { status: 401 }
      );
    }

    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    for (const cookieName of SESSION_COOKIE_CANDIDATES) {
      session = await auth.api.getSession({
        headers: new Headers({
          cookie: `${cookieName}=${token}`,
        }),
      });
      if (session?.user) {
        break;
      }
    }

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Return user data
    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Token verification failed' },
      { status: 500 }
    );
  }
}
