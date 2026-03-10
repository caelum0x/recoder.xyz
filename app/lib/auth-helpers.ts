/**
 * Auth Helper Functions for API Routes
 *
 * Uses `@recoder/auth` shared helpers for cookie extraction so that
 * cookie names and parsing logic are kept in a single place.
 * The `user` table (Better Auth web auth) and `users` table (CLI auth)
 * remain SEPARATE by design.
 *
 * This module also exports `getUserFromToken` for CLI Bearer-token
 * authentication (previously in a separate auth-helper.ts file).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { cookies, headers } from 'next/headers';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { auth } from '@/lib/auth-config';
import {
  extractSessionToken,
  extractSessionTokenFromHeader,
  parseSessionToken,
} from '@recoder/auth/edge';

/**
 * Extract and validate user from a CLI Bearer token.
 * Used by API routes that serve CLI clients authenticated via access tokens.
 */
export async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Find session by access token
    const session = await prisma.cli_sessions.findUnique({
      where: { accessToken: token },
      include: { users: true }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    return session.users;
  } catch (error) {
    logger.error('Token validation error', { error: String(error) });
    return null;
  }
}

/**
 * Get session from Better Auth cookie.
 *
 * Priority:
 *   1. Better Auth server API (`auth.api.getSession`)
 *   2. Better Auth session cookie parsing fallback
 */
export async function getSession(request?: NextRequest) {
  try {
    // Resolve Better Auth session through the canonical server API first.
    // This keeps /api/auth/session and route-level auth checks consistent.
    try {
      const resolvedHeaders = request ? request.headers : await headers();
      const betterAuthSession = await auth.api.getSession({ headers: resolvedHeaders });

      if (betterAuthSession?.user) {
        const appUser = await prisma.users.findUnique({
          where: { email: betterAuthSession.user.email },
          select: { id: true }
        });

        const userIdForKeys = appUser?.id || betterAuthSession.user.id;
        const hasApiKey = await prisma.user_api_keys.count({
          where: {
            userId: userIdForKeys,
            isActive: true,
          }
        }) > 0;

        return {
          user: {
            id: betterAuthSession.user.id,
            email: betterAuthSession.user.email,
            name: betterAuthSession.user.name,
            image: betterAuthSession.user.image,
            hasApiKey,
            subscription: 'free',
            role: 'user',
          },
          expires: new Date(betterAuthSession.session.expiresAt).toISOString(),
        };
      }
    } catch (error) {
      logger.warn('Canonical Better Auth session check failed, falling back to cookie/JWT parsing', {
        error: String(error),
      });
    }

    let betterAuthToken: string | null = null;

    if (request) {
      // Extract Better Auth session token using shared helpers
      const rawToken = extractSessionToken(
        (name) => request.cookies.get(name)?.value ?? null,
      );

      if (rawToken) {
        betterAuthToken = parseSessionToken(rawToken);
      }

      // Fallback: parse raw Cookie header (for cross-service calls)
      if (!betterAuthToken) {
        const cookieHeader = request.headers.get('cookie');
        if (cookieHeader) {
          betterAuthToken = extractSessionTokenFromHeader(cookieHeader);
        }
      }
    } else {
      // Server-side: read from Next.js cookie store
      const cookieStore = await cookies();

      const rawToken = extractSessionToken(
        (name) => cookieStore.get(name)?.value ?? null,
      );

      if (rawToken) {
        betterAuthToken = parseSessionToken(rawToken);
      }
    }

    // Try Better Auth first
    if (betterAuthToken) {
      try {
        // Query Better Auth session
        const session = await prisma.session.findFirst({
          where: {
            token: betterAuthToken,
            expiresAt: {
              gt: new Date()
            }
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                image: true,
              }
            }
          }
        });

        if (session?.user) {
          // Look up corresponding user in 'users' table (API keys are stored with this ID)
          const appUser = await prisma.users.findUnique({
            where: { email: session.user.email },
            select: { id: true }
          });

          // Use app user ID for API key lookup, fall back to Better Auth ID
          const userIdForKeys = appUser?.id || session.user.id;

          // Check if user has any API keys
          const hasApiKey = await prisma.user_api_keys.count({
            where: {
              userId: userIdForKeys,
              isActive: true
            }
          }) > 0;

          return {
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              image: session.user.image,
              hasApiKey,
              subscription: 'free',
              role: 'user',
            },
            expires: session.expiresAt.toISOString()
          };
        }
      } catch (error) {
        logger.error('Better Auth session check failed', { error: String(error) });
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to get session', { error: String(error) });
    return null;
  }
}

export async function ensureAppUserFromAuthUser(authUser: {
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  if (!authUser.email) {
    return null;
  }

  let appUser = await prisma.users.findUnique({
    where: { email: authUser.email },
  });

  if (appUser) {
    return appUser;
  }

  try {
    appUser = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email: authUser.email,
        name: authUser.name || authUser.email.split('@')[0],
        image: authUser.image || null,
        emailVerified: true,
        subscription: 'free',
        role: 'user',
        isActive: true,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    logger.warn('Failed to create app user from Better Auth user, retrying lookup', {
      email: authUser.email,
      error: String(error),
    });
    appUser = await prisma.users.findUnique({
      where: { email: authUser.email },
    });
  }

  return appUser;
}

/**
 * Require authentication in API routes
 * Returns session or throws 401 response
 */
export async function requireAuth(request?: NextRequest) {
  const session = await getSession(request);
  
  if (!session?.user) {
    return {
      error: true,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    };
  }
  
  return {
    error: false,
    session,
    user: session.user
  };
}

/**
 * Get user from session
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const session = await getSession();
  return !!session?.user;
}

/**
 * Check if user has a specific subscription plan
 */
export async function hasSubscription(requiredPlan: 'free' | 'pro' | 'premium' | 'enterprise') {
  const session = await getSession();
  if (!session?.user) return false;

  // Fetch user's subscription plan from database
  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: { subscriptionPlan: true }
  });

  if (!user) return false;

  const planHierarchy = {
    free: 0,
    pro: 1,
    premium: 2,
    enterprise: 3,
  };

  const userPlanLevel = planHierarchy[user.subscriptionPlan as keyof typeof planHierarchy] || 0;
  const requiredPlanLevel = planHierarchy[requiredPlan];

  return userPlanLevel >= requiredPlanLevel;
}

/**
 * Require a specific subscription level
 * Returns error response if user doesn't have required plan
 */
export async function requireSubscription(requiredPlan: 'free' | 'pro' | 'premium' | 'enterprise') {
  const auth = await requireAuth();
  if (auth.error) return auth;

  const hasAccess = await hasSubscription(requiredPlan);

  if (!hasAccess) {
    return {
      error: true,
      response: NextResponse.json(
        {
          error: 'Subscription required',
          message: `This feature requires a ${requiredPlan} subscription or higher`,
          requiredPlan
        },
        { status: 403 }
      )
    };
  }

  return auth;
}
