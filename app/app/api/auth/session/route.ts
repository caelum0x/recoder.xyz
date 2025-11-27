/**
 * Session verification endpoint for recoder-web
 * GET /api/auth/session
 *
 * Returns the current user session if authenticated
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get session from better-auth using the request headers
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { user: null, session: null },
        { status: 401 }
      );
    }

    // Return session data in the format recoder-web expects
    return NextResponse.json({
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
      },
    });
  } catch (error) {
    console.error('[API] Session verification error:', error);
    return NextResponse.json(
      { user: null, session: null, error: 'Session verification failed' },
      { status: 500 }
    );
  }
}
