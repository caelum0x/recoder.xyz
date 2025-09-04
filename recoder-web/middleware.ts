import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Protect /projects and /editor routes
  if (request.nextUrl.pathname.startsWith('/projects') || 
      request.nextUrl.pathname.startsWith('/editor')) {
    
    // Check for session token in cookies
    const sessionToken = request.cookies.get('next-auth.session-token') || 
                        request.cookies.get('__Secure-next-auth.session-token');
    
    if (!sessionToken) {
      const newUrl = new URL('/auth/login', request.nextUrl.origin);
      return NextResponse.redirect(newUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/projects/:path*', '/editor/:path*'],
};
