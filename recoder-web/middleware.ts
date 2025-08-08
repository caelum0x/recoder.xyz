import { NextRequest, NextResponse } from 'next/server';
import { ServerAuth } from './lib/auth/server-auth';
import { routerSecurityMiddleware } from './lib/security/router-security-middleware';

export async function middleware(request: NextRequest) {
  // Apply router security middleware first
  const securityResponse = await routerSecurityMiddleware(request, {
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableAnomalyDetection: true,
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxFailedAttemptsBeforeBan: 5,
    banDurationMinutes: 60,
    enableGeoBlocking: false,
    suspiciousPatterns: [],
    allowedCountries: [],
    blockedIPs: []
  });

  // If security middleware blocked the request, return its response
  if (securityResponse.status === 403) {
    return securityResponse;
  }

  const response = NextResponse.next();
  
  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff'); 
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Handle authentication for protected routes
  const pathname = request.nextUrl.pathname;
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/api/auth/login', '/api/auth/register', '/', '/pricing'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  // API routes that require authentication
  const protectedApiRoutes = ['/api/chat', '/api/user', '/api/projects'];
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route));
  
  // Dashboard and app routes that require authentication
  const protectedRoutes = ['/dashboard', '/settings', '/agents', '/templates', '/admin'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtectedRoute || isProtectedApi) {
    const session = await ServerAuth.validateSession(request);
    
    if (!session) {
      // Redirect to login for protected routes
      if (isProtectedRoute) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
      
      // Return 401 for protected API routes
      if (isProtectedApi) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
    }
    
    // Check admin access
    if (pathname.startsWith('/admin') && session?.user.email !== 'admin@recoder.xyz') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    // Add session info to headers for server components
    if (session) {
      response.headers.set('X-User-Id', session.user.id);
      response.headers.set('X-User-Plan', session.user.plan);
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/auth/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};