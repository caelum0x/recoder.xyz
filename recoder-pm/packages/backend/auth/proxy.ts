import { type NextRequest, NextResponse } from "next/server";
import {
  extractSessionToken as _extractSessionToken,
  parseSessionToken,
} from "@recoder/auth/edge";

/**
 * Session management middleware for Next.js.
 * Uses @recoder/auth shared edge helpers for cookie extraction (Prisma-free).
 * Replaces the old Supabase session refresh middleware.
 */
export function updateSession(request: NextRequest) {
  const rawToken = _extractSessionToken(
    (name) => request.cookies.get(name)?.value ?? null,
  );
  const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/sign-in") ||
    request.nextUrl.pathname.startsWith("/sign-up") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth");

  if (!(sessionToken || isAuthRoute)) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "pm.recoder.xyz";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const returnTo = `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
    const signInUrl = new URL("https://recoder.xyz/auth/signin");
    signInUrl.searchParams.set("redirect", returnTo);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next({ request });
}
