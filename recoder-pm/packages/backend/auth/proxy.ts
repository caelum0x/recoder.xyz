import { parseSessionToken, SESSION_COOKIE_NAMES } from "@recoder/auth/session";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Session management middleware for Next.js.
 * Replaces the old Supabase session refresh middleware.
 * With Better Auth using cookie-based sessions, we simply
 * check if a session token exists and redirect to sign-in if not.
 */
export function updateSession(request: NextRequest) {
  const rawToken =
    request.cookies.get(SESSION_COOKIE_NAMES[0])?.value ??
    request.cookies.get(SESSION_COOKIE_NAMES[1])?.value;
  const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/sign-in") ||
    request.nextUrl.pathname.startsWith("/sign-up") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth");

  if (!(sessionToken || isAuthRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
