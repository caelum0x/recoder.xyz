import { auth } from "@/lib/auth-config";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { SURFACE_ORIGINS } from "@recoder/auth/edge";

/**
 * /api/auth/[...all] — the live Better Auth surface for recoder.xyz.
 *
 * Serves the Better Auth instance built in lib/auth-config.ts directly.
 * Every other auth-touching route in this app (2FA, API keys, CLI device
 * flow, OAuth callbacks, session reads, billing/checkout guards — 30+
 * files) already imports that same `auth` export and treats it as the
 * source of truth. This is the ONE entry point the client SDK
 * (lib/auth-client.ts) calls for sign-up, sign-in, sign-out, and
 * get-session, so it has to use the identical instance or every browser
 * session silently breaks.
 *
 * HISTORY / WHY THIS CHANGED BACK: 2026-07-16 (811fe38a7e) switched this
 * file to proxy to a planned backend-owned Better Auth
 * (RECODER_BACKEND_URL or BACKEND_URL + /api/auth/*) as part of a "Phase A"
 * identity-unification effort. That separate identity backend was never
 * deployed — still true as of the 2026-10-16 follow-up guard (c631e09cb2),
 * which only turned the failure mode into a clean 503 instead of an
 * OOM-crashing self-fetch loop. Net effect: every sign-up, sign-in, and
 * get-session call has returned `503 auth service misconfigured` in
 * production, while the other 30+ routes kept reading the local instance —
 * blocking 100% of new signups and all Pro/Team checkout (checkout starts
 * from an authenticated dashboard). Reverting to the local instance matches
 * AGENTS.md's own rule ("recoder.xyz is the auth source of truth") and what
 * the rest of the codebase already does. If a real separate identity
 * backend is ever actually deployed, reintroduce the proxy deliberately —
 * with the backend running and verified first, not before.
 */

const getAllowedOrigins = () => [
  ...Object.values(SURFACE_ORIGINS),
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3007",
];

function corsHeadersFor(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Cookie, X-Better-Auth-CSRF",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
  if (getAllowedOrigins().includes(origin) || origin.endsWith(".recoder.xyz")) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(origin) });
}

const { GET: localGET, POST: localPOST } = toNextJsHandler(auth);

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeadersFor(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function unavailable(origin: string, message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 503, headers: corsHeadersFor(origin) },
  );
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const pathname = request.nextUrl.pathname;

  // Better Auth's social sign-in only accepts POST and replies with JSON
  // {url}. Cross-subdomain links (e.g. from agency.recoder.xyz) arrive as a
  // GET — convert to POST, then issue a real HTTP redirect, forwarding any
  // state cookie Better Auth set on the synthesized call.
  if (pathname.includes("/sign-in/social")) {
    const provider = request.nextUrl.searchParams.get("provider");
    const callbackURL = request.nextUrl.searchParams.get("callbackURL");
    if (provider && callbackURL) {
      try {
        const postRequest = new NextRequest(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, callbackURL }),
        });
        const response = await localPOST(postRequest);
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        if (body?.url) {
          const redirect = NextResponse.redirect(body.url, 302);
          const setCookie = response.headers.get("set-cookie");
          if (setCookie) redirect.headers.set("set-cookie", setCookie);
          return redirect;
        }
        return withCors(response, origin);
      } catch (error) {
        return unavailable(
          origin,
          error instanceof Error ? error.message : "social sign-in failed",
        );
      }
    }
  }

  try {
    const response = await localGET(request);
    return withCors(response, origin);
  } catch (error) {
    return unavailable(
      origin,
      error instanceof Error ? error.message : "authentication service error",
    );
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  try {
    const response = await localPOST(request);
    return withCors(response, origin);
  } catch (error) {
    return unavailable(
      origin,
      error instanceof Error ? error.message : "authentication service error",
    );
  }
}
