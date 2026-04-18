/**
 * Server-side session verification for recoder-web
 * Verifies sessions shared from recoder.xyz via better-auth
 */

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('AuthSession');


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

type SessionCookieUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
};

function normalizeSessionCookieUser(value: unknown): SessionCookieUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const direct = value as Partial<SessionCookieUser> & { user?: unknown };
  const candidate = direct.user && typeof direct.user === 'object'
    ? direct.user as Partial<SessionCookieUser>
    : direct;

  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    email: candidate.email,
    name: candidate.name ?? null,
    image: candidate.image ?? null,
    imageUrl: candidate.imageUrl ?? null,
    subscriptionPlan: candidate.subscriptionPlan,
    subscriptionStatus: candidate.subscriptionStatus,
  };
}

export const WEB_SESSION_DATA_COOKIE_NAMES = [
  '__Secure-recoder.web_session_data',
  'recoder.web_session_data',
] as const;

const SESSION_DATA_COOKIE_NAMES = [
  ...WEB_SESSION_DATA_COOKIE_NAMES,
  '_Secure-recoder.session_data',
  '__Secure-recoder.session_data',
  'recoder.session_data',
  '_Secure-better-auth.session_data',
  '__Secure-better-auth.session_data',
  'better-auth.session_data',
] as const;

function base64UrlDecode(value: string): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');

  return decodeURIComponent(
    Array.from(atob(base64))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

/**
 * Internal URL for server-to-server session verification.
 *
 * Inside Docker the container cannot reach `https://recoder.xyz` (DNS/TLS
 * roundtrip through Cloudflare). Use MAIN_SITE_INTERNAL_URL
 * (e.g. http://host.docker.internal:3000) for the server-side fetch.
 */
function getInternalMainSiteUrl(): string {
  return process.env.MAIN_SITE_INTERNAL_URL
    || process.env.MAIN_SITE_URL
    || (process.env.NODE_ENV === 'production' ? 'https://recoder.xyz' : 'http://localhost:3000');
}

/**
 * Public URL for browser-facing redirects (login, signup).
 * Always uses the external URL that browsers can reach.
 */
function getPublicMainSiteUrl(): string {
  return process.env.MAIN_SITE_URL
    || (process.env.NODE_ENV === 'production' ? 'https://recoder.xyz' : 'http://localhost:3000');
}

function getSessionVerificationUrls(): string[] {
  const urls = [getInternalMainSiteUrl(), getPublicMainSiteUrl()]
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter((url) => url.length > 0);

  return [...new Set(urls)];
}

/**
 * Verify session by calling main site's better-auth API
 * This reads the shared cookie and verifies it with the main site
 */
/**
 * Extract session token from cookie header.
 * Better Auth uses __Secure-recoder.session_token (production)
 * or recoder.session_token (dev).
 */
function extractSessionToken(cookieHeader: string): string | null {
  const cookieNames = [
    '__Secure-recoder.session_token',
    'recoder.session_token',
    'better-auth.session_token',
    '__Secure-better-auth.session_token',
  ];
  for (const name of cookieNames) {
    // Match name=value, handling URL-encoded and quoted values
    const regex = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`);
    const match = cookieHeader.match(regex);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

function extractCookieValue(cookieHeader: string, cookieName: string): string | null {
  const regex = new RegExp(`(?:^|;\\s*)${cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`);
  const match = cookieHeader.match(regex);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseSessionDataCookie(rawValue: string | null | undefined): SessionCookieUser | null {
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = base64UrlDecode(rawValue);
    const parsed = JSON.parse(decoded) as {
      session?: { user?: SessionCookieUser };
    };

    return normalizeSessionCookieUser(parsed.session?.user);
  } catch {
    return null;
  }
}

export async function verifySession(request: Request): Promise<Session | null> {
  try {
    const cookieHeader = request.headers.get('Cookie');

    if (!cookieHeader) {
      logger.info('[Auth] No cookies found in request');
      return null;
    }

    const cookieUser = SESSION_DATA_COOKIE_NAMES
      .map((name) => parseSessionDataCookie(extractCookieValue(cookieHeader, name)))
      .find(Boolean);

    if (cookieUser) {
      logger.info('[Auth] Session resolved from session_data cookie for user:', cookieUser.email);
      return {
        user: {
          id: cookieUser.id,
          email: cookieUser.email,
          name: cookieUser.name ?? null,
          image: cookieUser.image ?? cookieUser.imageUrl ?? null,
          subscriptionPlan: cookieUser.subscriptionPlan ?? 'free',
          subscriptionStatus: cookieUser.subscriptionStatus ?? 'active',
        },
        sessionId: '',
        expiresAt: new Date(),
      };
    }

    // Extract session token from cookie to pass as Bearer token.
    // Cookies are domain-scoped to .recoder.xyz — when the server-side fetch
    // goes to an internal URL (host.docker.internal), the cookies don't apply.
    // Passing the token explicitly as Authorization header works around this.
    const sessionToken = extractSessionToken(cookieHeader);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (sessionToken) {
      // Pass token as both cookie AND Bearer so it works regardless of
      // whether the internal URL matches the cookie domain or not.
      headers['Cookie'] = cookieHeader;
      headers['Authorization'] = `Bearer ${sessionToken}`;
    } else {
      headers['Cookie'] = cookieHeader;
    }

    let lastStatus: number | null = null;

    for (const mainSiteUrl of getSessionVerificationUrls()) {
      try {
        const response = await fetch(`${mainSiteUrl}/api/auth/session`, {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          lastStatus = response.status;
          logger.warn(`[Auth] Session verification failed via ${mainSiteUrl}: ${response.status}`);
          continue;
        }

        const data = await response.json() as SessionApiResponse;

        if (!data?.user) {
          logger.warn(`[Auth] No user in session response from ${mainSiteUrl}`);
          continue;
        }

        logger.info('[Auth] Session verified for user:', data.user.email);

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
        logger.warn(`[Auth] Session verification fetch failed via ${mainSiteUrl}:`, error);
      }
    }

    if (lastStatus !== null) {
      logger.info('[Auth] Session verification failed for all origins, last status:', lastStatus);
    } else {
      logger.info('[Auth] Session verification failed for all origins');
    }
    return null;
  } catch (error) {
    logger.error('[Auth] Error verifying session:', error);
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
  const mainSiteUrl = getPublicMainSiteUrl();

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
  const mainSiteUrl = getPublicMainSiteUrl();

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
