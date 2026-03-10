/**
 * Cross-domain session verification utilities for @recoder/auth.
 *
 * Provides convenient high-level helpers that any frontend surface
 * (app, recoder-frontend, recoder-agency, recoder-studio, recoder-pm)
 * can use to verify Better Auth sessions across the recoder.xyz ecosystem.
 *
 * All surfaces share the same session cookie (`recoder.session_token`)
 * set on `.recoder.xyz` with the `recoder` prefix, so a user who signs
 * in on recoder.xyz is automatically authenticated on all subdomains.
 *
 * Architecture:
 * - `user` table = Better Auth web auth (sign-in/sign-up/social)
 * - `users` table = CLI auth (device flow / API keys)
 * - These are SEPARATE by design and MUST NOT be merged.
 *
 * Usage Patterns:
 *
 *   // 1. Next.js API route (from NextRequest)
 *   import { verifySessionFromRequest } from "@recoder/auth/cross-domain";
 *   const session = await verifySessionFromRequest(request);
 *
 *   // 2. Next.js server component (from cookies())
 *   import { verifySessionFromCookieStore } from "@recoder/auth/cross-domain";
 *   const session = await verifySessionFromCookieStore();
 *
 *   // 3. Cross-service HTTP call (from raw Cookie header)
 *   import { verifySessionFromHeader } from "@recoder/auth/cross-domain";
 *   const session = await verifySessionFromHeader(cookieHeaderString);
 *
 *   // 4. Edge Middleware (fast, no DB)
 *   import { hasSessionInRequest } from "@recoder/auth/cross-domain";
 *   if (!hasSessionInRequest(request)) redirect("/login");
 */

import {
  extractSessionToken,
  extractSessionTokenFromHeader,
  hasSessionCookie,
  parseSessionToken,
  COOKIE_DOMAIN,
  SURFACE_ORIGINS,
  SESSION_COOKIE_NAMES,
} from "./edge";
import { verifySessionToken } from "./session";
import type { AuthSession, AuthCoreUser } from "./session";

export type { AuthSession, AuthCoreUser } from "./session";
export { COOKIE_DOMAIN, SURFACE_ORIGINS, SESSION_COOKIE_NAMES };

/**
 * The primary auth origin where sign-in/sign-up is hosted.
 * Other surfaces redirect here for authentication.
 */
export const AUTH_ORIGIN = SURFACE_ORIGINS.app;

// ─── Edge-compatible helpers (no DB access) ────────────────────────

/**
 * Check if a request-like object has a session cookie.
 * Edge-compatible: no database access required.
 *
 * Works with any object that has a `cookies.get(name)` method
 * (NextRequest, NextMiddlewareRequest, etc.).
 */
export function hasSessionInRequest(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
): boolean {
  return hasSessionCookie(
    (name) => request.cookies.get(name)?.value ?? null,
  );
}

/**
 * Extract the session token from a request-like object.
 * Edge-compatible: no database access required.
 * Returns the raw token (before signature stripping).
 */
export function extractSessionFromRequest(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
): string | null {
  return extractSessionToken(
    (name) => request.cookies.get(name)?.value ?? null,
  );
}

// ─── Server-side helpers (require DB access) ───────────────────────

/**
 * Verify session from a request-like object (NextRequest, etc.).
 * Requires server runtime (Prisma/database access).
 *
 * @param request - An object with cookies.get() method
 * @returns Verified session with user data, or null
 */
export async function verifySessionFromRequest(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
): Promise<AuthSession | null> {
  const rawToken = extractSessionToken(
    (name) => request.cookies.get(name)?.value ?? null,
  );
  if (!rawToken) {
    return null;
  }
  return verifySessionToken(rawToken);
}

/**
 * Verify session from a Next.js cookie store.
 * Requires server runtime (Prisma/database access).
 *
 * Usage:
 *   import { cookies } from "next/headers";
 *   const session = await verifySessionFromCookieStore(await cookies());
 */
export async function verifySessionFromCookieStore(
  cookieStore: { get: (name: string) => { value: string } | undefined },
): Promise<AuthSession | null> {
  const rawToken = extractSessionToken(
    (name) => cookieStore.get(name)?.value ?? null,
  );
  if (!rawToken) {
    return null;
  }
  return verifySessionToken(rawToken);
}

/**
 * Verify session from a raw HTTP Cookie header string.
 * Requires server runtime (Prisma/database access).
 *
 * Useful for cross-service calls where only the raw header is available
 * (e.g., docker-backend, Python backend, or proxy routes).
 */
export async function verifySessionFromHeader(
  cookieHeader: string,
): Promise<AuthSession | null> {
  const token = extractSessionTokenFromHeader(cookieHeader);
  if (!token) {
    return null;
  }
  // extractSessionTokenFromHeader already calls parseSessionToken
  return verifySessionToken(token);
}

/**
 * Verify session from a getter function.
 * Requires server runtime (Prisma/database access).
 *
 * This is the most flexible form - pass any function that can look up
 * a cookie value by name.
 */
export async function verifySessionFromGetter(
  getCookie: (name: string) => string | undefined | null,
): Promise<AuthSession | null> {
  const rawToken = extractSessionToken(getCookie);
  if (!rawToken) {
    return null;
  }
  return verifySessionToken(rawToken);
}

// ─── Cookie attribute helpers ──────────────────────────────────────

/**
 * Get the standard cookie attributes for the session cookie.
 * Useful when a surface needs to manually set or clear the cookie.
 */
export function getSessionCookieAttributes(options?: { production?: boolean }) {
  const isProd = options?.production ?? process.env.NODE_ENV === "production";

  return {
    cookieName: isProd
      ? "__Secure-recoder.session_token"
      : "recoder.session_token",
    domain: isProd ? COOKIE_DOMAIN : undefined,
    path: "/",
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
  };
}

/**
 * Get cookie names and clear-cookie attributes for sign-out.
 * Both cookie variants must be cleared to ensure full logout.
 */
export function getSignOutCookieAttributes(options?: { production?: boolean }) {
  const isProd = options?.production ?? process.env.NODE_ENV === "production";
  const domain = isProd ? COOKIE_DOMAIN : undefined;

  return SESSION_COOKIE_NAMES.map((name) => ({
    name,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    ...(domain ? { domain } : {}),
  }));
}

/**
 * Check if a given origin is a trusted recoder.xyz surface.
 * Useful for CORS validation in auth endpoints.
 */
export function isTrustedOrigin(origin: string): boolean {
  if (!origin) return false;

  // Check exact match against known surfaces
  const knownOrigins = Object.values(SURFACE_ORIGINS);
  if (knownOrigins.includes(origin as typeof knownOrigins[number])) {
    return true;
  }

  // Allow any *.recoder.xyz subdomain
  try {
    const url = new URL(origin);
    return (
      url.hostname === "recoder.xyz" ||
      url.hostname.endsWith(".recoder.xyz")
    );
  } catch {
    return false;
  }
}
