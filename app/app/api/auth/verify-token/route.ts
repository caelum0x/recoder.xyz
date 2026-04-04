import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';
import { prisma } from '@/lib/prisma';

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

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error: message, ...extra },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

async function resolveSessionFromToken(token: string) {
  // Try Better Auth's getSession first
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  for (const cookieName of SESSION_COOKIE_CANDIDATES) {
    session = await auth.api.getSession({
      headers: new Headers({
        cookie: `${cookieName}=${token}`,
      }),
    });
    if (session?.user) {
      return session;
    }
  }

  // Fallback: direct DB lookup (handles cases where Better Auth cookie
  // prefix mismatch prevents getSession from finding valid sessions).
  // Check "sessions" (primary, where adapter writes) then "session" (legacy).
  // Use Prisma instead of dynamic pg import so Next standalone includes the
  // dependency path in production builds.
  try {
    const sessionToken = token.includes('.') ? token.split('.')[0] : token;
    const activeSessionWhere = {
      token: sessionToken,
      expiresAt: { gt: new Date() },
    };

    const primarySession = await prisma.sessions.findFirst({
      where: activeSessionWhere,
      include: { users: true },
    });

    if (primarySession?.users) {
      return {
        user: {
          id: primarySession.users.id,
          email: primarySession.users.email,
          name: primarySession.users.name,
          image: primarySession.users.image,
        },
        session: {
          userId: primarySession.userId,
          expiresAt: primarySession.expiresAt,
          token: sessionToken,
        },
      };
    }

    const legacySession = await prisma.session.findFirst({
      where: activeSessionWhere,
      include: { user: true },
    });

    if (legacySession?.user) {
      return {
        user: {
          id: legacySession.user.id,
          email: legacySession.user.email,
          name: legacySession.user.name,
          image: legacySession.user.image,
        },
        session: {
          userId: legacySession.userId,
          expiresAt: legacySession.expiresAt,
          token: sessionToken,
        },
      };
    }
  } catch (e) {
    console.error('Direct DB session lookup fallback failed:', e);
  }

  return null;
}

async function extractVerifiedToken(
  request: NextRequest,
  rawBody?: string,
): Promise<{ token: string } | { token: null; reason: string }> {
  const authResult = verifyInternalServiceRequest(request, { rawBody: rawBody ?? '' });
  if (!authResult.ok) {
    return {
      token: null,
      reason: 'reason' in authResult ? authResult.reason : 'missing_internal_auth',
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const tokenFromBearer = bearerMatch?.[1]?.trim() || '';
  const tokenFromCookie = extractTokenFromCookieHeader(request.headers.get('cookie') || '');

  let tokenFromBody = '';
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as { token?: string };
      tokenFromBody = parsed.token?.trim() || '';
    } catch {
      throw new Error('invalid_json');
    }
  }

  return { token: normalizeSessionToken(tokenFromBody || tokenFromBearer || tokenFromCookie) };
}

async function handleVerification(request: NextRequest, rawBody?: string) {
  try {
    const tokenResult = await extractVerifiedToken(request, rawBody);

    if (tokenResult.token === null) {
      return jsonError('Unauthorized', 401, {
        reason: 'reason' in tokenResult ? tokenResult.reason : 'missing_internal_auth',
      });
    }

    const token = tokenResult.token;

    if (!token) {
      return jsonError('Token is required', 400);
    }

    const session = await resolveSessionFromToken(token);
    if (!session || !session.user) {
      return jsonError('Invalid or expired token', 401);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_json') {
      return jsonError('Invalid JSON payload', 400);
    }
    console.error('Token verification error:', error);
    return jsonError('Token verification failed', 500);
  }
}

export async function GET(request: NextRequest) {
  return handleVerification(request);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  return handleVerification(request, rawBody);
}
