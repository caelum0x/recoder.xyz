import { NextRequest, NextResponse } from "next/server";
import { SURFACE_ORIGINS } from "@recoder/auth/edge";

/**
 * /api/auth/[...all] — PROXY to the backend-owned Better Auth surface.
 *
 * Phase A (RECODER-NEXT-PHASE, owner-locked): the Node backend hosts Better
 * Auth (`backend/src/domains/identity`, mounted at /api/auth) and is the ONE
 * identity authority; this website no longer constructs its own Better Auth
 * engine for the auth flows — it forwards them verbatim and relays the
 * responses (including every Set-Cookie) so sign-in/sign-up/social/magic-link/
 * sign-out are issued by the single backend config. Server-side session READS
 * elsewhere in the site (lib/auth-config) keep reading the same auth DB and are
 * unified in a follow-up slice.
 *
 * Preserved website behaviors:
 *  - CORS for the *.recoder.xyz surfaces (the browser talks to this origin).
 *  - GET /sign-in/social conversion: Better Auth only accepts POST and returns
 *    JSON {url}; cross-subdomain links arrive as GET, so we convert and issue a
 *    real HTTP redirect, forwarding the state cookies.
 *
 * Truthful degrade: an unreachable backend is a 503 with a clear error — never
 * a faked session.
 */

/** The control-plane backend origin (prod: pm2 recoder-backend on :8000). */
const BACKEND_URL = (
  process.env.RECODER_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

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

/** Headers that must not be forwarded either direction across the proxy hop. */
const HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "keep-alive",
]);

/**
 * Forward the incoming auth request to the backend verbatim and relay the
 * response — status, headers (multi-value Set-Cookie included), and body.
 * `redirect: manual` so OAuth redirects pass through to the browser untouched.
 */
async function proxyToBackend(
  request: NextRequest,
  init?: { method?: string; body?: BodyInit | null },
): Promise<NextResponse> {
  const origin = request.headers.get("origin") || "";
  const target = `${BACKEND_URL}${request.nextUrl.pathname}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  // Let the backend's Better Auth build correct absolute URLs behind this hop.
  headers.set("x-forwarded-host", request.nextUrl.host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  const method = init?.method ?? request.method;
  let body: BodyInit | null | undefined = init?.body;
  if (body === undefined && method !== "GET" && method !== "HEAD") {
    body = Buffer.from(await request.arrayBuffer());
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: "manual" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "auth backend unreachable";
    return NextResponse.json(
      { success: false, error: `auth service unavailable: ${message}` },
      { status: 503, headers: corsHeadersFor(origin) },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || HOP_HEADERS.has(key.toLowerCase())) return;
    outHeaders.set(key, value);
  });
  // Set-Cookie must be appended per-value — collapsing corrupts the session.
  for (const cookie of upstream.headers.getSetCookie()) {
    outHeaders.append("set-cookie", cookie);
  }
  for (const [key, value] of Object.entries(corsHeadersFor(origin))) {
    outHeaders.set(key, value);
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  return new NextResponse(payload.length > 0 ? payload : null, {
    status: upstream.status,
    headers: outHeaders,
  });
}

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Better Auth social sign-in only supports POST and returns JSON {url}.
  // Cross-subdomain redirects (e.g. from agency.recoder.xyz) arrive as GET —
  // convert to a proxied POST and issue a REAL redirect, forwarding the state
  // cookies the backend set.
  if (pathname.includes("/sign-in/social")) {
    const provider = request.nextUrl.searchParams.get("provider");
    const callbackURL = request.nextUrl.searchParams.get("callbackURL");
    if (provider && callbackURL) {
      const proxied = await proxyToBackend(request, {
        method: "POST",
        body: JSON.stringify({ provider, callbackURL }),
      });
      const bodyText = await proxied.text();
      let url: string | undefined;
      try {
        url = (JSON.parse(bodyText) as { url?: string }).url;
      } catch {
        /* non-JSON upstream reply — fall through to the raw response */
      }
      if (proxied.ok && url) {
        const redirect = NextResponse.redirect(url, 302);
        for (const cookie of proxied.headers.getSetCookie()) {
          redirect.headers.append("set-cookie", cookie);
        }
        return redirect;
      }
      return new NextResponse(bodyText || null, {
        status: proxied.status,
        headers: proxied.headers,
      });
    }
  }

  return proxyToBackend(request);
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request);
}
