import { NextRequest } from "next/server";

/**
 * Mobile OAuth callback bridge.
 *
 * After a successful OAuth sign-in, better-auth sets a session cookie and
 * redirects here.  This endpoint reads the cookie and redirects to the
 * mobile deep-link with the session token in query params so the native
 * app can store it.
 *
 * Flow:
 *   better-auth OAuth callback
 *     → sets cookie, redirects to /api/auth/mobile-callback?returnUrl=recoder://auth/callback
 *     → this route reads cookie, redirects to recoder://auth/callback?access_token=<token>
 */
export async function GET(request: NextRequest) {
  const returnUrl =
    request.nextUrl.searchParams.get("returnUrl") || "recoder://auth/callback";

  // Only allow redirects to the mobile deep-link scheme
  if (!returnUrl.startsWith("recoder://")) {
    return new Response("Invalid return URL — only recoder:// scheme allowed", {
      status: 400,
    });
  }

  // Read the session token from better-auth cookies
  const sessionToken =
    request.cookies.get("recoder.session_token")?.value ||
    request.cookies.get("__Secure-recoder.session_token")?.value;

  if (!sessionToken) {
    const errorUrl = new URL(returnUrl);
    errorUrl.searchParams.set("error", "no_session");
    errorUrl.searchParams.set(
      "error_description",
      "Authentication failed — no session cookie found"
    );
    return new Response(null, {
      status: 302,
      headers: { Location: errorUrl.toString() },
    });
  }

  // Redirect to mobile deep-link with token in query params.
  // We pass the same token as both access_token and refresh_token because
  // better-auth uses a single session token (no separate refresh flow).
  const successUrl = new URL(returnUrl);
  successUrl.searchParams.set("access_token", sessionToken);
  successUrl.searchParams.set("refresh_token", sessionToken);

  return new Response(null, {
    status: 302,
    headers: { Location: successUrl.toString() },
  });
}
