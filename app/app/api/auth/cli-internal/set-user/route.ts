import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth-helpers';
import { verifyInternalServiceRequest } from '@/lib/internal-service-auth';

/**
 * POST - Store user info for an auth code (called from cli-callback page)
 * Also syncs user from better-auth to our users table
 *
 * Auth: either a signed internal-service request (INTERNAL_SERVICE_KEY, for
 * server-to-server callers, which may specify the target user in the body) or
 * an authenticated browser session (the cli-callback page). Session callers
 * bind the auth code to THEIR OWN session identity — client-supplied user_id /
 * user_email / user_name in the body are ignored so a logged-in user cannot
 * bind a CLI auth code to somebody else's account.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'invalid_json'
      }, { status: 400 });
    }

    const { code, redirect_uri, client_id } = body as {
      code?: string;
      redirect_uri?: string;
      client_id?: string;
    };

    let user_id: string | undefined;
    let user_email: string | undefined;
    let user_name: string | undefined;

    const internal = verifyInternalServiceRequest(request, { rawBody });
    if (internal.ok) {
      user_id = typeof body.user_id === 'string' ? body.user_id : undefined;
      user_email = typeof body.user_email === 'string' ? body.user_email : undefined;
      user_name = typeof body.user_name === 'string' ? body.user_name : undefined;
    } else {
      const authResult = await requireAuth(request);
      if (authResult.error) {
        return NextResponse.json({
          success: false,
          error: 'unauthorized'
        }, { status: 401 });
      }
      user_id = authResult.user.id;
      user_email = authResult.user.email ?? undefined;
      user_name = authResult.user.name ?? undefined;
    }

    if (!code || !user_id) {
      return NextResponse.json({
        success: false,
        error: 'missing_parameters'
      }, { status: 400 });
    }

    // Check if user exists in our users table, if not sync from better-auth
    let appUser = await prisma.users.findUnique({
      where: { id: user_id }
    });

    if (!appUser && user_email) {
      // Try to find by email
      appUser = await prisma.users.findUnique({
        where: { email: user_email }
      });
    }

    if (!appUser) {
      // Create user in our users table (sync from better-auth)
      appUser = await prisma.users.create({
        data: {
          id: user_id,
          email: user_email || `user-${user_id}@recoder.xyz`,
          name: user_name || 'CLI User',
          emailVerified: true, // They authenticated via OAuth
          subscription: 'free',
          subscriptionPlan: 'free',
          subscriptionStatus: 'active',
          updatedAt: new Date(),
        }
      });
      logger.info('Created new CLI user', { email: appUser.email, route: 'auth/cli-internal/set-user' });
    }

    // Store auth code in database
    await prisma.authCode.upsert({
      where: { code },
      update: {
        userId: appUser.id,
        used: false,
      },
      create: {
        id: nanoid(),
        code,
        userId: appUser.id,
        clientId: client_id || 'recoder-code',
        redirectUri: redirect_uri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      }
    });

    // Clean up expired codes
    await prisma.authCode.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User info stored for auth code',
      user_id: appUser.id
    });

  } catch (error) {
    logger.error('Set user error:', { error: String(error), route: 'auth/cli-internal/set-user' });
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * GET - Retrieve user info for an auth code (called during token exchange)
 *
 * Auth: signed internal-service request only. This handler maps an auth code
 * to a user identity, so it must never be reachable by unauthenticated
 * callers; no browser page consumes it (token exchange is server-to-server).
 */
export async function GET(request: NextRequest) {
  const internal = verifyInternalServiceRequest(request, { rawBody: '' });
  if (!internal.ok) {
    return NextResponse.json({
      success: false,
      error: 'unauthorized'
    }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({
      success: false,
      error: 'missing_code'
    }, { status: 400 });
  }

  try {
    const authCode = await prisma.authCode.findUnique({
      where: { code },
      include: { user: true }
    });

    if (!authCode) {
      return NextResponse.json({
        success: false,
        error: 'code_not_found'
      }, { status: 404 });
    }

    if (authCode.used) {
      return NextResponse.json({
        success: false,
        error: 'code_already_used'
      }, { status: 400 });
    }

    if (new Date() > authCode.expiresAt) {
      return NextResponse.json({
        success: false,
        error: 'code_expired'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: {
        user_id: authCode.userId,
        user_email: authCode.user?.email,
        user_name: authCode.user?.name
      }
    });
  } catch (error) {
    logger.error('Get user error:', { error: String(error), route: 'auth/cli-internal/set-user' });
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}
