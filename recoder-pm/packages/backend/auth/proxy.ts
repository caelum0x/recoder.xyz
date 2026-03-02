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
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
