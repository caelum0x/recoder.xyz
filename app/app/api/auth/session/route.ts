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

export async function GET(request: NextRequest) {
  try {
    // Use Better Auth to get session
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      logger.info('No session found', { route: 'api/auth/session' });
      return NextResponse.json(assertAuthSessionGetResponse({ user: null }), { status: 200 });
    }

    logger.info('Session verified', { route: 'api/auth/session', email: session.user.email });

    return NextResponse.json(assertAuthSessionGetResponse({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        subscriptionPlan: (session.user as any).subscriptionPlan || 'free',
        subscriptionStatus: (session.user as any).subscriptionStatus || 'active',
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
