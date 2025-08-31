import { auth } from '@/lib/auth/unified-auth';

export default auth((req) => {
  // Protect /projects and /editor routes
  if (req.nextUrl.pathname.startsWith('/projects') || 
      req.nextUrl.pathname.startsWith('/editor')) {
    if (!req.auth) {
      const newUrl = new URL('/auth/login', req.nextUrl.origin);
      return Response.redirect(newUrl);
    }
  }
});

export const config = {
  matcher: ['/projects/:path*', '/editor/:path*'],
};
