/**
 * Auth Helper Functions for API Routes
 * Provides convenient wrappers for Better Auth
 */

import { auth } from './auth-config';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Get session in API routes
 * @returns Session object or null
 */
export async function getSession() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });
    return session;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Require authentication in API routes
 * Returns session or throws 401 response
 */
export async function requireAuth() {
  const session = await getSession();
  
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

  const planHierarchy = {
    free: 0,
    pro: 1,
    premium: 2,
    enterprise: 3,
  };

  const userPlanLevel = planHierarchy[session.user.subscriptionPlan as keyof typeof planHierarchy] || 0;
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
