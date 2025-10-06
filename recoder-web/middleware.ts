import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting store (in-memory for now, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per window
const MAX_REQUEST_SIZE = 1 * 1024 * 1024; // 1MB

// CORS configuration
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3010',
  'https://recoder.xyz',
  'https://www.recoder.xyz',
  'https://chat.recoder.xyz',
  process.env.NEXTAUTH_URL,
  process.env.WEB_URL,
  process.env.CHAT_URL,
].filter(Boolean);

export function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  // 1. CORS Handling
  const requestOrigin = request.headers.get('origin') || origin;
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ||
                         requestOrigin.startsWith('http://localhost') ||
                         process.env.NODE_ENV === 'development';

  // Create response
  let response = NextResponse.next();

  // Set CORS headers
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
  }
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS, PATCH'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: response.headers
    });
  }

  // 2. Request Size Limit Check (only for POST, PUT, PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      return new NextResponse(
        JSON.stringify({
          error: 'Payload too large',
          message: `Request body must be less than ${MAX_REQUEST_SIZE / 1024 / 1024}MB`,
          code: 'PAYLOAD_TOO_LARGE'
        }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(response.headers)
          }
        }
      );
    }
  }

  // 3. Rate Limiting (only for API routes)
  if (pathname.startsWith('/api/')) {
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

    const now = Date.now();
    const clientKey = `${clientIP}:${pathname}`;

    let rateLimitData = rateLimitStore.get(clientKey);

    if (!rateLimitData || now > rateLimitData.resetTime) {
      // New window or expired window
      rateLimitData = {
        count: 0,
        resetTime: now + RATE_LIMIT_WINDOW
      };
    }

    rateLimitData.count++;
    rateLimitStore.set(clientKey, rateLimitData);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      const entriesToDelete: string[] = [];
      rateLimitStore.forEach((value, key) => {
        if (now > value.resetTime) {
          entriesToDelete.push(key);
        }
      });
      entriesToDelete.forEach(key => rateLimitStore.delete(key));
    }

    // Check if rate limit exceeded
    if (rateLimitData.count > RATE_LIMIT_MAX_REQUESTS) {
      const resetIn = Math.ceil((rateLimitData.resetTime - now) / 1000);

      return new NextResponse(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${resetIn} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: resetIn
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': resetIn.toString(),
            'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitData.resetTime.toString(),
            ...Object.fromEntries(response.headers)
          }
        }
      );
    }

    // Add rate limit headers to successful responses
    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - rateLimitData.count);
    response.headers.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitData.resetTime.toString());
  }

  // 4. Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  // 5. Authentication for protected routes
  if (pathname.startsWith('/projects') || pathname.startsWith('/editor')) {
    const sessionToken = request.cookies.get('next-auth.session-token') ||
                        request.cookies.get('__Secure-next-auth.session-token');

    if (!sessionToken) {
      const newUrl = new URL('/auth/login', request.nextUrl.origin);
      return NextResponse.redirect(newUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
