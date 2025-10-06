import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { guestRegex, isDevelopmentEnvironment } from './lib/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    /*
     * Playwright starts the dev server and requires a 200 status to
     * begin the tests, so this ensures that the tests can start
     */
    if (pathname.startsWith('/ping')) {
      return new Response('pong', { status: 200 });
    }

    // Allow all auth API routes to pass through
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }

    // Health check endpoint
    if (pathname.startsWith('/api/health')) {
      return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Get authentication token with error handling
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/register', '/privacy', '/terms', '/test'];
    const isPublicRoute = publicRoutes.includes(pathname);

    if (!token) {
      // Allow access to public routes
      if (isPublicRoute || pathname.startsWith('/api/auth')) {
        return NextResponse.next();
      }

      // Redirect to login for protected routes
      const loginUrl = new URL('/login', request.url);
      if (pathname !== '/') {
        loginUrl.searchParams.set('callbackUrl', pathname);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Validate token structure
    if (!token.email || !token.id) {
      console.warn('Invalid token structure:', { hasEmail: !!token.email, hasId: !!token.id });
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const isGuest = guestRegex.test(token.email);

    // Redirect authenticated users away from auth pages
    if (token && !isGuest && isPublicRoute) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Add user info to headers for downstream use
    const response = NextResponse.next();
    response.headers.set('x-user-id', token.id);
    response.headers.set('x-user-type', isGuest ? 'guest' : 'user');
    
    return response;

  } catch (error) {
    console.error('Middleware error:', error);
    
    // On error, allow public routes but redirect others to login
    const publicRoutes = ['/login', '/register', '/privacy', '/terms', '/test'];
    if (publicRoutes.includes(pathname) || pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }
    
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/',
    '/chat/:id',
    '/api/:path*',
    '/login',
    '/register',

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
