import { withAuth } from "next-auth/middleware";
import { routerSecurityMiddleware } from "./lib/security/router-security-middleware";

export default withAuth(
  async function middleware(req) {
    // Apply router security middleware first
    const securityResponse = await routerSecurityMiddleware(req, {
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

    // Continue with NextAuth middleware logic
    return securityResponse;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to auth pages without authentication
        if (req.nextUrl.pathname.startsWith("/auth/")) {
          return true;
        }
        
        // Protect admin pages - require authentication and admin role
        if (req.nextUrl.pathname.startsWith("/admin/")) {
          return !!token && token.email === "admin@recoder.xyz";
        }
        
        // Protect dashboard and settings pages
        if (
          req.nextUrl.pathname.startsWith("/dashboard") ||
          req.nextUrl.pathname.startsWith("/settings") ||
          req.nextUrl.pathname.startsWith("/profile")
        ) {
          return !!token;
        }
        
        // Allow chat creation for authenticated users (optional protection)
        // Uncomment the lines below to require authentication for chat creation
        // if (req.nextUrl.pathname.startsWith("/chat/")) {
        //   return !!token;
        // }
        
        // Allow access to all other pages
        return true;
      },
    },
  }
);

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