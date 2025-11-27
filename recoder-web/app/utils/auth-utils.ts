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
    return process.env.NODE_ENV === 'production'
      ? 'https://recoder.xyz'
      : 'http://localhost:3000'; // Main app port
  }

  // Client-side: check if we're on localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000'; // Main app port
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

/**
 * Get current user from client-side session
 * Note: Returns null if not authenticated
 * TODO: Implement proper client-side session retrieval
 */
export function getCurrentUser(): User | null {
  // Temporary stub - returns null (anonymous user)
  // In production, this should check client-side session/cookie
  return null;
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
