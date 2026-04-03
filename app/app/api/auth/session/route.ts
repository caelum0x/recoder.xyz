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
import {
  extractSessionTokenFromHeader,
  verifySession as verifySessionFromDB,
} from '@recoder/auth';

function getOptionalStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const field = record[key];
  return typeof field === 'string' ? field : undefined;
}

function getCookieFromHeader(cookieHeader: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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

    let session = await auth.api.getSession({
      headers: reqHeaders
    });

    if (!session?.user && cookieVal && extractSessionTokenFromHeader(cookieVal)) {
      try {
        const fallbackSession = await verifySessionFromDB((name) =>
          getCookieFromHeader(cookieVal, name),
        );

        if (fallbackSession?.user) {
          logger.info('Session verified via DB fallback', {
            route: 'api/auth/session',
            email: fallbackSession.user.email,
          });

          return NextResponse.json(assertAuthSessionGetResponse({
            user: {
              id: fallbackSession.user.id,
              email: fallbackSession.user.email,
              name: fallbackSession.user.name,
              image: fallbackSession.user.image,
              subscriptionPlan: 'free',
              subscriptionStatus: 'active',
            },
            session: {
              id: fallbackSession.sessionId,
              expiresAt: fallbackSession.expiresAt.toISOString(),
            }
          }));
        }
      } catch (fallbackError) {
        logger.warn('Session DB fallback failed', {
          route: 'api/auth/session',
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }

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
