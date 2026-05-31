/**
 * Git API Proxy
 *
 * Proxies `/api/git/...` requests from the dashboard to the docker-backend
 * (docker.recoder.xyz). The backend authenticates via the Better Auth session
 * token, which we forward by passing along the original request cookies and an
 * Authorization bearer derived from the session cookie.
 *
 * This proxy only forwards to the existing docker-backend git routes; it does
 * not implement any backend logic of its own.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://docker.recoder.xyz'
    : 'http://localhost:3100');

// Better Auth session cookie names (mirrors docker-backend getSessionTokenFromRequest).
const SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Secure-session_token',
  'recoder_session_token',
  'session_token',
];

function resolveSessionToken(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) {
      return value;
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  return proxyRequest(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  return proxyRequest(request, params.path, 'POST');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const path = pathSegments.join('/');

    // The GitHub PAT arrives in the `x-github-token` header so it never appears
    // in a browser-visible URL or client-side proxy access logs. We forward it
    // to docker-backend as a server-side `?token=` query param (the backend git
    // routes read `req.query.token`). This conversion happens only here, on the
    // server, so the token is never exposed in a URL the browser can see.
    const githubToken = request.headers.get('x-github-token');
    const searchParams = new URLSearchParams(request.nextUrl.searchParams);
    if (githubToken && !searchParams.has('token')) {
      searchParams.set('token', githubToken);
    }
    const search = searchParams.toString();
    const url = `${BACKEND_URL}/api/git/${path}${search ? `?${search}` : ''}`;

    let body: string | undefined;
    if (method !== 'GET') {
      const json = await request.json().catch(() => null);
      if (json !== null) {
        body = JSON.stringify(json);
      }
    }

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Email': session.user.email,
      'X-User-Id': session.user.id,
    };

    const sessionToken = resolveSessionToken(request);
    if (sessionToken) {
      requestHeaders['Authorization'] = `Bearer ${sessionToken}`;
    }

    // Forward the original cookie header so the backend can resolve the
    // Better Auth session token by its prefixed cookie name as well.
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      requestHeaders['Cookie'] = cookieHeader;
    }

    const backendResponse = await fetch(url, {
      method,
      headers: requestHeaders,
      body,
      cache: 'no-store',
    });

    const data = await backendResponse.json().catch(() => ({
      success: false,
      error: 'Invalid response from backend',
    }));

    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error('Git proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
