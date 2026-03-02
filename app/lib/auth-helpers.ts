/**
 * Auth Helper Functions for API Routes
 *
 * Uses `@recoder/auth` shared helpers for cookie extraction so that
 * cookie names and parsing logic are kept in a single place.
 * The `user` table (Better Auth web auth) and `users` table (CLI auth)
 * remain SEPARATE by design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import {
  extractSessionToken,
  extractSessionTokenFromHeader,
  parseSessionToken,
} from '@recoder/auth/edge';

/**
 * Get session from Better Auth cookie or JWT token.
 *
 * Priority:
 *   1. Better Auth session cookie (`recoder.session_token`)
 *   2. Legacy JWT `auth-token` cookie / Bearer header
 */
export async function getSession(request?: NextRequest) {
  try {
    let token: string | undefined;
    let betterAuthToken: string | null = null;

    if (request) {
      // Get legacy JWT token from request cookies or Authorization header
      token = request.cookies.get('auth-token')?.value ||
              request.headers.get('authorization')?.replace('Bearer ', '');

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
      token = cookieStore.get('auth-token')?.value;

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

    // Fallback to JWT auth
    if (!token) {
      return null;
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET;
    if (!jwtSecret) {
      console.error('[auth-helpers] JWT_SECRET or BETTER_AUTH_SECRET is not configured');
      return null;
    }
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Fetch user from database
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
      }
    });

    if (!user) {
      return null;
    }

    // Check if user has any API keys
    const hasApiKey = await prisma.user_api_keys.count({
      where: {
        userId: user.id,
        isActive: true
      }
    }) > 0;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        hasApiKey,
        subscription: 'free',
        role: 'user',
      },
      expires: new Date(decoded.exp * 1000).toISOString()
    };
  } catch (error) {
    logger.error('Failed to get session', { error: String(error) });
    return null;
  }
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
