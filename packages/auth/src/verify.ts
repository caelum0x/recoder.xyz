/**
 * Cross-surface session verification helpers for @recoder/auth.
 *
 * This module provides utilities that can be used across all frontend surfaces
 * (app, recoder-studio) to verify and extract Better Auth session tokens
 * from requests/cookies.
 *
 * IMPORTANT: The edge-compatible functions (hasSessionCookie, extractSessionToken)
 * do NOT import from Prisma and can safely be used in Edge Middleware.
 * The full verification function (verifySession) requires a server runtime.
 */

import {
  COOKIE_DOMAIN,
  SURFACE_ORIGINS,
  SESSION_COOKIE_NAMES,
  hasSessionCookie,
  extractSessionToken,
  extractSessionTokenFromHeader,
} from "./edge";
import { verifySessionToken } from "./session";
import type { AuthSession } from "./session";

export type { AuthSession } from "./session";


/**
 * Full server-side session verification from cookies.
 *
 * NOT edge-compatible: requires Prisma/database access.
 * Use in API routes, server components, and server actions.
 *
 * @param getCookie - A function that retrieves a cookie value by name.
 * @returns The verified session with user data, or null.
 */
export async function verifySession(
  getCookie: (name: string) => string | undefined | null
): Promise<AuthSession | null> {
  const rawToken = extractSessionToken(getCookie);
  if (!rawToken) {
    return null;
  }
  return verifySessionToken(rawToken);
}

export {
  COOKIE_DOMAIN,
  SURFACE_ORIGINS,
  SESSION_COOKIE_NAMES,
  hasSessionCookie,
  extractSessionToken,
  extractSessionTokenFromHeader,
};
