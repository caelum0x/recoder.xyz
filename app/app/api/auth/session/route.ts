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

export async function GET(request: NextRequest) {
  try {
    // Use Better Auth to get session
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      console.log('[Session API] No session found');
      return NextResponse.json(assertAuthSessionGetResponse({ user: null }), { status: 200 });
    }

    console.log('[Session API] Session verified for user:', session.user.email);

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
    console.error('[Session API] Error:', error);
    return NextResponse.json(assertAuthSessionGetResponse({ user: null }), { status: 200 });
  }
}
