/**
 * Session verification endpoint
 * GET /api/auth/session
 *
 * Returns the current user session if authenticated
 * Used by recoder-web to verify cross-subdomain sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { assertAuthSessionGetResponse } from '@/lib/contracts/auth-session-contracts';
import { logger } from '@/lib/logger';

function getOptionalStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const field = record[key];
  return typeof field === 'string' ? field : undefined;
}

export async function GET(request: NextRequest) {
  try {
    // Use Better Auth to get session
    const reqHeaders = await headers();
    const cookieVal = reqHeaders.get('cookie') || 'NONE';
    const hasSessionCookie = cookieVal.includes('recoder.session_token');
    logger.info('Session check starting', {
      route: 'api/auth/session',
      hasCookie: hasSessionCookie,
      cookieLen: cookieVal.length,
      host: reqHeaders.get('host') || 'NONE',
      origin: reqHeaders.get('origin') || 'NONE',
    });

    const session = await auth.api.getSession({
      headers: reqHeaders
    });

    if (!session?.user) {
      logger.info('No session found', { route: 'api/auth/session', hasCookie: hasSessionCookie });
      return NextResponse.json(assertAuthSessionGetResponse({ user: null }), { status: 200 });
    }

    logger.info('Session verified', { route: 'api/auth/session', email: session.user.email });

    return NextResponse.json(assertAuthSessionGetResponse({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        subscriptionPlan: getOptionalStringField(session.user, 'subscriptionPlan') || 'free',
        subscriptionStatus: getOptionalStringField(session.user, 'subscriptionStatus') || 'active',
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      }
    }));

  } catch (error) {
    logger.error('Session API error', { route: 'api/auth/session', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(assertAuthSessionGetResponse({ user: null }), { status: 200 });
  }
}
