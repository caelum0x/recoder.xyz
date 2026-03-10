import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('AuthUtils');
/**
 * Client-side authentication utilities
 * Works with server-side session from recoder.xyz (better-auth)
 */

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

/**
 * Get main site URL for redirects
 */
export function getMainSiteUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.MAIN_SITE_URL || (process.env.NODE_ENV === 'production'
      ? 'https://recoder.xyz'
      : 'http://localhost:3000');
  }

  // Client-side: check if we're on localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  return 'https://recoder.xyz';
}

/**
 * Redirect to login page
 */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;

  const currentUrl = window.location.href;
  const mainSiteUrl = getMainSiteUrl();
  const loginUrl = `${mainSiteUrl}/auth/signin?redirect=${encodeURIComponent(currentUrl)}`;

  window.location.href = loginUrl;
}

/**
 * Redirect to signup page
 */
export function redirectToSignup(): void {
  if (typeof window === 'undefined') return;

  const currentUrl = window.location.href;
  const mainSiteUrl = getMainSiteUrl();
  const signupUrl = `${mainSiteUrl}/auth/signup?redirect=${encodeURIComponent(currentUrl)}`;

  window.location.href = signupUrl;
}

/**
 * Logout user (redirect to main site logout)
 */
export function logout(): void {
  if (typeof window === 'undefined') return;

  const mainSiteUrl = getMainSiteUrl();
  window.location.href = `${mainSiteUrl}/api/auth/sign-out?callbackURL=${encodeURIComponent(window.location.origin)}`;
}

// Cached user session
let cachedUser: User | null = null;
let sessionFetched = false;
let sessionFetchPromise: Promise<User | null> | null = null;

/**
 * Fetch session from server API
 */
async function fetchSession(): Promise<User | null> {
  if (typeof window === 'undefined') return null;

  try {
    const response = await fetch('/api/session', {
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { authenticated?: boolean; user?: User };

    if (data.authenticated && data.user) {
      cachedUser = data.user;
      return data.user;
    }

    return null;
  } catch (error) {
    logger.error('[auth-utils] Failed to fetch session:', error);
    return null;
  }
}

/**
 * Initialize session - call this early in app lifecycle
 */
export async function initSession(): Promise<User | null> {
  if (sessionFetched) {
    return cachedUser;
  }

  if (sessionFetchPromise) {
    return sessionFetchPromise;
  }

  sessionFetchPromise = fetchSession().finally(() => {
    sessionFetched = true;
    sessionFetchPromise = null;
  });

  return sessionFetchPromise;
}

/**
 * Get current user from client-side session
 * Returns cached user or null if not authenticated
 * Call initSession() first to ensure session is loaded
 */
export function getCurrentUser(): User | null {
  // If session hasn't been fetched yet, trigger fetch (fire and forget)
  if (!sessionFetched && !sessionFetchPromise) {
    initSession();
  }

  return cachedUser;
}

/**
 * Get current user async - waits for session to be fetched
 */
export async function getCurrentUserAsync(): Promise<User | null> {
  if (sessionFetched) {
    return cachedUser;
  }

  return initSession();
}

/**
 * Clear cached session (call on logout)
 */
export function clearSession(): void {
  cachedUser = null;
  sessionFetched = false;
  sessionFetchPromise = null;
}

/**
 * Check if user has a specific plan (client-side)
 * Note: This should be verified server-side for security
 */
export function hasSubscription(
  user: User | null,
  requiredPlan: 'free' | 'pro' | 'premium' | 'enterprise'
): boolean {
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
