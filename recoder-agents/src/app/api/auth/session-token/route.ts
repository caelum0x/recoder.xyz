import { NextRequest, NextResponse } from "next/server";
import { extractSessionToken, parseSessionToken } from "@recoder/auth/edge";
import { resolveAuthBaseUrl } from "@/lib/runtime-urls";

/**
 * Bridge route: validates session via recoder.xyz Better Auth, then returns
 * the parsed token for the frontend API client (Bearer auth).
 *
 * Key fix: forward ALL cookies including __Secure- prefix ones.
 * Better Auth requires __Secure-recoder.session_token (with .signature suffix)
 * for session validation. Previous bug: only forwarded recoder.session_token.
 */
export async function GET(request: NextRequest) {
  // Build cookie header from ALL request cookies (including __Secure- prefix)
  const allCookies = request.cookies.getAll();
  const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

  if (!cookieHeader) {
    return NextResponse.json({ data: { accessToken: null } }, { status: 200 });
  }

  // Try Better Auth validation first (proper auth)
  try {
    const authBaseUrl = resolveAuthBaseUrl();
    const sessionResponse = await fetch(`${authBaseUrl}/api/auth/session`, {
      method: "GET",
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (sessionResponse.ok) {
      const payload = (await sessionResponse.json()) as { user?: unknown };
      if (payload.user) {
        // Session verified — return the parsed token for Bearer auth
        const rawToken = extractSessionToken((name) => request.cookies.get(name)?.value ?? null);
        const accessToken = rawToken ? parseSessionToken(rawToken) : null;
        return NextResponse.json({ data: { accessToken } }, { status: 200 });
      }
    }
  } catch (error) {
    console.error("[session-token] Better Auth proxy failed:", error);
  }

  // Fallback: extract token directly (Python backend validates via DB lookup)
  const rawToken = extractSessionToken((name) => request.cookies.get(name)?.value ?? null);
  const accessToken = rawToken ? parseSessionToken(rawToken) : null;

  return NextResponse.json(
    { data: { accessToken } },
    { status: 200 },
  );
}
