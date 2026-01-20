/**
 * Server-side session verification for recoder-web
 * Verifies sessions shared from recoder.xyz via better-auth
 */

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

export interface Session {
  user: User;
  sessionId: string;
  expiresAt: Date;
}

// API Response Type for session verification
interface SessionApiResponse {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    subscriptionPlan?: string;
    subscriptionStatus?: string;
  };
  session?: {
    id?: string;
    expiresAt?: string;
  };
}

/**
 * Get the main site URL based on environment
 */
function getMainSiteUrl(): string {
  const mainSiteUrl = process.env.MAIN_SITE_URL;
  console.log('[Auth] MAIN_SITE_URL env:', mainSiteUrl, 'NODE_ENV:', process.env.NODE_ENV);
  if (mainSiteUrl) {
    return mainSiteUrl;
  }
  // Default to production or development
  return process.env.NODE_ENV === 'production'
    ? 'https://recoder.xyz'
    : 'http://localhost:3000'; // Main app port
}

/**
 * Verify session by calling main site's better-auth API
 * This reads the shared cookie and verifies it with the main site
 */
export async function verifySession(request: Request): Promise<Session | null> {
  try {
    const mainSiteUrl = getMainSiteUrl();
    const cookieHeader = request.headers.get('Cookie');

    if (!cookieHeader) {
      console.log('[Auth] No cookies found in request');
      return null;
    }

    // Call main site's session verification endpoint
    // The cookie will be automatically sent to the main site since it's on the same domain
    const response = await fetch(`${mainSiteUrl}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      console.log('[Auth] Session verification failed:', response.status);
      return null;
    }

    const data = await response.json() as SessionApiResponse;

    if (!data?.user) {
      console.log('[Auth] No user in session response');
      return null;
    }

    console.log('[Auth] Session verified for user:', data.user.email);

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name ?? null,
        image: data.user.image ?? null,
        subscriptionPlan: data.user.subscriptionPlan ?? 'free',
        subscriptionStatus: data.user.subscriptionStatus ?? 'active',
      },
      sessionId: data.session?.id ?? '',
      expiresAt: data.session?.expiresAt ? new Date(data.session.expiresAt) : new Date(),
    };
  } catch (error) {
    console.error('[Auth] Error verifying session:', error);
    return null;
  }
}

/**
 * Get current user from session
 */
export async function getCurrentUser(request: Request): Promise<User | null> {
  const session = await verifySession(request);
  return session?.user || null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(request: Request): Promise<boolean> {
  const session = await verifySession(request);
  return !!session?.user;
}

/**
 * Check if user has a specific subscription plan
 */
export async function hasSubscription(
  request: Request,
  requiredPlan: 'free' | 'pro' | 'premium' | 'enterprise'
): Promise<boolean> {
  const user = await getCurrentUser(request);
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
 * Build login redirect URL
 * @param currentUrl - Full current URL to redirect back to after login
 */
export function getLoginUrl(currentUrl?: string): string {
  const mainSiteUrl = getMainSiteUrl();

  // If currentUrl is provided and it's a full URL (starts with http), use it directly
  // Otherwise, construct the Web IDE URL from the pathname
  let redirectUrl = currentUrl;
  if (currentUrl && !currentUrl.startsWith('http')) {
    // currentUrl is just a pathname, construct full Web IDE URL
    const webIdeUrl = process.env.RECODER_WEB_URL
      
      || (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173');
    redirectUrl = `${webIdeUrl}${currentUrl}`;
  }

  const redirect = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
  return `${mainSiteUrl}/auth/signin${redirect}`;
}

/**
 * Build signup redirect URL
 * @param currentUrl - Full current URL to redirect back to after signup
 */
export function getSignupUrl(currentUrl?: string): string {
  const mainSiteUrl = getMainSiteUrl();

  // If currentUrl is provided and it's a full URL (starts with http), use it directly
  // Otherwise, construct the Web IDE URL from the pathname
  let redirectUrl = currentUrl;
  if (currentUrl && !currentUrl.startsWith('http')) {
    // currentUrl is just a pathname, construct full Web IDE URL
    const webIdeUrl = process.env.RECODER_WEB_URL
      
      || (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173');
    redirectUrl = `${webIdeUrl}${currentUrl}`;
  }

  const redirect = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
  return `${mainSiteUrl}/auth/signup${redirect}`;
}
