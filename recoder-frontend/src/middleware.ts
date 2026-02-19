import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/i18n/config';
import { detectBestLocaleFromHeaders } from '@/lib/utils/geo-detection-server';

/** Session cookie names used by better-auth with "recoder" prefix */
const SESSION_COOKIE_NAMES = [
  'recoder.session_token',
  '__Secure-recoder.session_token',
] as const;

/**
 * Check if a request has a valid session cookie.
 * This is a fast edge check — the cookie presence indicates an authenticated session.
 * Full session validation happens server-side via the auth database.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(name => !!request.cookies.get(name)?.value);
}

function getSessionToken(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }
  return null;
}

// Marketing pages that support locale routing for SEO (/de, /it, etc.)
const MARKETING_ROUTES = [
  '/',
  '/about',
  '/legal',
  '/support',
  '/templates',
];

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/', // Homepage should be public!
  '/auth',
  '/auth/callback',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/legal',
  '/api/auth',
  '/share', // Shared content should be public
  '/templates', // Template pages should be public
  '/master-login', // Master password admin login
  '/checkout', // Public checkout wrapper for Apple compliance
  '/support', // Support page should be public
  '/about', // About page should be public for SEO
  '/help', // Help center and documentation should be public
  '/credits-explained', // Credits explained page should be public
  '/agents-101',
  '/about', // About page should be public 
  '/milano', // Milano page should be public
  '/berlin', // Berlin page should be public
  '/app', // App download page should be public,
  '/careers',
  '/pricing', // Pricing page should be public
  '/tutorials', // Tutorials page should be public
  '/countryerror', // Country restriction error page should be public
  ...locales.flatMap(locale => MARKETING_ROUTES.map(route => `/${locale}${route === '/' ? '' : route}`)),
];

// App store links for mobile redirect
const APP_STORE_LINKS = {
  ios: 'https://apps.apple.com/ie/app/recoder/id6754448524',
  android: 'https://play.google.com/store/apps/details?id=com.recoder.app',
};

const BILLING_STATUS_COOKIE = 'recoder.billing_status';
const BILLING_BLOCKED_REDIRECT = '/setting-up';
const BILLING_STATUS_MAX_AGE_ACTIVE_SECONDS = 300;
const BILLING_STATUS_MAX_AGE_BLOCKED_SECONDS = 120;

// Detect mobile platform from User-Agent header (edge-optimized)
function detectMobilePlatformFromUA(userAgent: string | null): 'ios' | 'android' | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 🚀 HYPER-FAST: Mobile app store redirect for /milano, /berlin, and /app
  // This runs at the edge before ANY page rendering
  if (pathname === '/milano' || pathname === '/berlin' || pathname === '/app') {
    const userAgent = request.headers.get('user-agent');
    const platform = detectMobilePlatformFromUA(userAgent);
    
    if (platform) {
      // Instant 302 redirect to app store - no page load needed
      return NextResponse.redirect(APP_STORE_LINKS[platform], { status: 302 });
    }
    // Desktop users continue to the full page
  }

  // Block access to WIP /thread/new route - redirect to dashboard
  if (pathname.includes('/thread/new')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  // Handle root-level auth verification redirects.
  // Some auth providers redirect to "/" instead of "/auth/callback".
  // Detect auth callback params and normalize to the callback route.
  if (pathname === '/' || pathname === '') {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const error = searchParams.get('error');
    
    // If we have auth callback parameters, redirect to /auth/callback.
    // Mobile app deep links bypass this route entirely.
    if (code || token || type || error) {
      const callbackUrl = new URL('/auth/callback', request.url);
      
      // Preserve all query parameters
      searchParams.forEach((value, key) => {
        callbackUrl.searchParams.set(key, value);
      });
      
      console.log('Redirecting root auth callback params to /auth/callback');
      return NextResponse.redirect(callbackUrl);
    }
  }

  // Extract path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const firstSegment = pathSegments[0];
  
  // Check if first segment is a locale (e.g., /de, /it, /de/about)
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    const locale = firstSegment as Locale;
    const remainingPath = '/' + pathSegments.slice(1).join('/') || '/';
    
    // Verify remaining path is a marketing route
    const isRemainingPathMarketing = MARKETING_ROUTES.some(route => {
      if (route === '/') {
        return remainingPath === '/' || remainingPath === '';
      }
      return remainingPath === route || remainingPath.startsWith(route + '/');
    });
    
    if (isRemainingPathMarketing) {
      // Rewrite /de to /, /de/about to /suna, etc.
      const response = NextResponse.rewrite(new URL(remainingPath, request.url));
      response.cookies.set('locale', locale, {
        path: '/',
        maxAge: 31536000, // 1 year
        sameSite: 'lax',
      });
      
      // Store locale in headers so next-intl can pick it up
      response.headers.set('x-locale', locale);
      
      return response;
    }
  }
  
  // Check if this is a marketing route (without locale prefix)
  const isMarketingRoute = MARKETING_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  const response = NextResponse.next({
    request,
  });

  // Check for better-auth session cookie (fast edge check)
  const isAuthenticated = hasSessionCookie(request);

  // Auto-redirect based on geo-detection for marketing pages
  // Only redirect if:
  // 1. User is visiting a marketing route without locale prefix
  // 2. User doesn't have an explicit preference (no cookie, no user metadata)
  // 3. Detected locale is not English (default)
  if (isMarketingRoute && (!firstSegment || !locales.includes(firstSegment as Locale))) {
    // Check if user has explicit preference in cookie
    const localeCookie = request.cookies.get('locale')?.value;
    const hasExplicitPreference = !!localeCookie && locales.includes(localeCookie as Locale);

    // Only auto-redirect if:
    // - No explicit preference (no cookie)
    // - Detected locale is not English (default)
    // This prevents unnecessary redirects for English speakers and users with preferences
    if (!hasExplicitPreference) {
      const acceptLanguage = request.headers.get('accept-language');
      
      const detectedLocale = detectBestLocaleFromHeaders(acceptLanguage);
      
      // Only redirect if detected locale is not English (default)
      // This prevents unnecessary redirects for English speakers
      if (detectedLocale !== defaultLocale) {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname = `/${detectedLocale}${pathname === '/' ? '' : pathname}`;
        
        const redirectResponse = NextResponse.redirect(redirectUrl);
        // Set cookie so we don't redirect again on next visit
        redirectResponse.cookies.set('locale', detectedLocale, {
          path: '/',
          maxAge: 31536000, // 1 year
          sameSite: 'lax',
        });
        return redirectResponse;
      }
    }
  }

  // Allow all public routes without any checks
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // Everything else requires authentication
  // Redirect to auth if no session cookie
  if (!isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Billing enforcement for authenticated private routes.
  // We use a short-lived cookie cache to avoid calling billing on every request.
  if (pathname !== BILLING_BLOCKED_REDIRECT) {
    const cachedBillingStatus = request.cookies.get(BILLING_STATUS_COOKIE)?.value;

    if (cachedBillingStatus === 'blocked') {
      const blockedUrl = request.nextUrl.clone();
      blockedUrl.pathname = BILLING_BLOCKED_REDIRECT;
      blockedUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(blockedUrl);
    }

    if (cachedBillingStatus !== 'active') {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
      const sessionToken = getSessionToken(request);

      if (backendUrl && sessionToken) {
        try {
          const billingResponse = await fetch(`${backendUrl}/v1/billing/account-state/minimal`, {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
            cache: 'no-store',
          });

          if (billingResponse.ok) {
            const billing = await billingResponse.json();
            const tierKey = billing?.subscription?.tier_key || billing?.tier?.name;
            const hasSubscription =
              billing?.has_subscription === true ||
              (typeof tierKey === 'string' && tierKey !== 'none');

            if (!hasSubscription) {
              const blockedUrl = request.nextUrl.clone();
              blockedUrl.pathname = BILLING_BLOCKED_REDIRECT;
              blockedUrl.searchParams.set('redirect', pathname);

              const redirectResponse = NextResponse.redirect(blockedUrl);
              redirectResponse.cookies.set(BILLING_STATUS_COOKIE, 'blocked', {
                path: '/',
                maxAge: BILLING_STATUS_MAX_AGE_BLOCKED_SECONDS,
                sameSite: 'lax',
              });
              return redirectResponse;
            }

            response.cookies.set(BILLING_STATUS_COOKIE, 'active', {
              path: '/',
              maxAge: BILLING_STATUS_MAX_AGE_ACTIVE_SECONDS,
              sameSite: 'lax',
            });
          }
        } catch (error) {
          // Non-fatal: if billing check is temporarily unavailable, let request proceed.
          console.warn('Billing check failed in middleware:', error);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - root path (/)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}; 
