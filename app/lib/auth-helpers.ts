/**
 * Auth Helper Functions for API Routes
 * Provides convenient wrappers for JWT authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

/**
 * Get session from JWT token
 * @param request - NextRequest object (optional)
 * @returns Session object or null
 */
export async function getSession(request?: NextRequest) {
  try {
    let token: string | undefined;
    
    if (request) {
      // Get token from request cookies or Authorization header
      token = request.cookies.get('auth-token')?.value || 
              request.headers.get('authorization')?.replace('Bearer ', '');
    } else {
      // Get token from server-side cookies
      const cookieStore = cookies();
      token = cookieStore.get('auth-token')?.value;
    }

    if (!token) {
      return null;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Fetch user from database
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        hasOwnApiKey: true,
        apiKey: true,
        subscription: true,
        role: true,
      }
    });

    if (!user) {
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        hasApiKey: !!(user.hasOwnApiKey || user.apiKey),
        subscription: user.subscription,
        role: user.role,
      },
      expires: new Date(decoded.exp * 1000).toISOString()
    };
  } catch (error) {
    console.error('Failed to get session:', error);
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
