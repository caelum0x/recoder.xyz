/**
 * Edge-safe session cookie helpers.
 *
 * This module MUST remain free of Prisma/database imports so it can be used
 * safely in Edge Middleware and other edge runtimes.
 */

/**
 * Cookie names used by better-auth with "recoder" prefix.
 */
export const SESSION_COOKIE_NAMES = [
  "recoder.session_token",
  "__Secure-recoder.session_token",
] as const;

/**
 * Cross-subdomain cookie domain for production.
 */
export const COOKIE_DOMAIN = ".recoder.xyz";

/**
 * All known frontend surface origins in the recoder.xyz ecosystem.
 * Used for CORS and trusted origin configuration.
 */
export const SURFACE_ORIGINS = {
  app: "https://recoder.xyz",
  web: "https://web.recoder.xyz",
  agents: "https://agents.recoder.xyz",
  frontend: "https://frontend.recoder.xyz", // legacy alias for agents
  agency: "https://agency.recoder.xyz",
  studio: "https://studio.recoder.xyz",
  pm: "https://pm.recoder.xyz",
  backend: "https://api.recoder.xyz",
  api: "https://api.recoder.xyz",
} as const;

/**
 * Parse the session token from a raw cookie value.
 * better-auth tokens may have a signature suffix after ".".
 */
export function parseSessionToken(rawToken: string): string {
  return rawToken.split(".")[0];
}

/**
 * Check if a cookie map contains a session cookie.
 */
export function hasSessionCookie(
  getCookie: (name: string) => string | undefined | null
): boolean {
  return SESSION_COOKIE_NAMES.some((name) => !!getCookie(name));
}

/**
 * Extract the raw session token from cookies.
 */
export function extractSessionToken(
  getCookie: (name: string) => string | undefined | null
): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = getCookie(name);
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * Parse the session token from a raw cookie header string.
 */
export function extractSessionTokenFromHeader(
  cookieHeader: string
): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const escapedName = name.replace(/\./g, "\\.");
    const regex = new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`);
    const match = cookieHeader.match(regex);
    if (match?.[1]) {
      const decoded = decodeURIComponent(match[1]);
      return parseSessionToken(decoded);
    }
  }
  return null;
}
