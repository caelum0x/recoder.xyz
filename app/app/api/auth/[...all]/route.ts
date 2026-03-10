import { auth } from "@/lib/auth-config";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { SURFACE_ORIGINS } from "@recoder/auth/edge";
import { logger } from "@/lib/logger";

/**
 * Allowed CORS origins for auth endpoints.
 * Uses the canonical list from @recoder/auth so all surfaces are included.
 */
const getAllowedOrigins = () => [
  ...Object.values(SURFACE_ORIGINS),
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3007',
];

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cookie, X-Better-Auth-CSRF',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };

  // Set origin header if it's in the allowed list
  if (allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (origin.endsWith('.recoder.xyz')) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return new NextResponse(null, { status: 204, headers });
}

// Wrap handlers to add CORS headers
const { GET: originalGET, POST: originalPOST } = toNextJsHandler(auth);

const addCorsHeaders = (response: Response, origin: string) => {
  const allowedOrigins = getAllowedOrigins();
  const newHeaders = new Headers(response.headers);

  if (allowedOrigins.includes(origin) || origin.endsWith('.recoder.xyz')) {
    newHeaders.set('Access-Control-Allow-Origin', origin);
    newHeaders.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

const authServiceUnavailable = (origin: string, message: string) => {
  const response = NextResponse.json(
    { success: false, error: message },
    { status: 503 }
  );
  return addCorsHeaders(response, origin);
};

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  try {
    const response = await originalGET(request);
    if (response.status >= 500) {
      return authServiceUnavailable(origin, 'Authentication service temporarily unavailable');
    }
    return addCorsHeaders(response, origin);
  } catch (error) {
    logger.error('Auth GET failed', { error: error instanceof Error ? error.message : String(error) });
    return authServiceUnavailable(origin, 'Authentication service temporarily unavailable');
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const pathname = request.nextUrl.pathname;
  const isSocialStart = pathname.includes('/sign-in/social');

  try {
    const response = await originalPOST(request);
    if (response.status >= 500) {
      if (isSocialStart) {
        return authServiceUnavailable(origin, 'Social sign-in is temporarily unavailable');
      }
      return authServiceUnavailable(origin, 'Authentication service temporarily unavailable');
    }
    return addCorsHeaders(response, origin);
  } catch (error) {
    logger.error('Auth POST failed', { error: error instanceof Error ? error.message : String(error) });
    if (isSocialStart) {
      return authServiceUnavailable(origin, 'Social sign-in is temporarily unavailable');
    }
    return authServiceUnavailable(origin, 'Authentication service temporarily unavailable');
  }
}
