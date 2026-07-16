import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { hasSessionCookie } from '@recoder/auth/edge';
import { locales, defaultLocale } from './i18n';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed'
});

const PROTECTED_PREFIXES = ['/dashboard', '/settings', '/billing', '/projects'];
const ADMIN_PREFIX = '/admin';
const PAYLOAD_CMS_PREFIX = '/cms';

/** Cookie name used to cache onboarding completion status at the edge. */
const ONBOARDING_COMPLETED_COOKIE = 'onboarding_completed';
/** Cookie name set when user explicitly skips onboarding. */
const ONBOARDING_SKIPPED_COOKIE = 'onboarding_skipped';

/** Paths that should never trigger the onboarding redirect. */
const ONBOARDING_BYPASS_PREFIXES = [
  '/cms',
  '/onboarding',
  '/auth',
  '/api',
  '/contact',
  '/about',
  '/learn',
  '/feedback',
  '/security',
  '/compliance',
  '/blog',
  '/tools',
  '/plan',
  '/platform',
];

function hasSessionCookieInRequest(request: NextRequest): boolean {
  return hasSessionCookie((name) => request.cookies.get(name)?.value);
}

function stripLocale(pathname: string): string {
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return pathname.slice(`/${locale}`.length) || '/';
    }
  }
  return pathname;
}

/**
 * Check if the user has completed onboarding by calling the status API.
 * Returns true if completed, false if not, or null if the check failed
 * (in which case we allow the request through to avoid blocking users).
 */
async function checkOnboardingStatus(request: NextRequest): Promise<boolean | null> {
  try {
    const statusUrl = new URL('/api/onboarding/save', request.url);
    const res = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      // If unauthorized or error, don't block — let the request through
      return null;
    }

    const data = await res.json();
    return data.onboardingCompleted === true;
  } catch {
    // Network error or timeout — fail open, don't block
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  const nextActionId = request.headers.get('next-action');
  if (request.method === 'POST' && nextActionId) {
    const isPlausibleActionId = /^[A-Za-z0-9_-]{20,}$/.test(nextActionId);
    if (!isPlausibleActionId) {
      return NextResponse.json({ error: 'Invalid Server Action id' }, { status: 400 });
    }
  }

  const isPayloadCmsRoute =
    request.nextUrl.pathname === PAYLOAD_CMS_PREFIX ||
    request.nextUrl.pathname.startsWith(`${PAYLOAD_CMS_PREFIX}/`);

  // Payload admin stays outside locale rewrites. Its route tree lives at
  // /cms, not /{locale}/cms, and Payload handles its own auth/session flow.
  const response = isPayloadCmsRoute ? NextResponse.next() : intlMiddleware(request);

  // Check if route is protected
  const stripped = stripLocale(request.nextUrl.pathname);
  const isProtected = PROTECTED_PREFIXES.some(
    prefix => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );

  if (isProtected) {
    if (!hasSessionCookieInRequest(request)) {
      const signInUrl = new URL(`/auth/signin`, request.url);
      const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      signInUrl.searchParams.set('redirect', redirectTarget);
      return NextResponse.redirect(signInUrl);
    }
  }

  const isAdminRoute = stripped === ADMIN_PREFIX || stripped.startsWith(`${ADMIN_PREFIX}/`);
  if (isAdminRoute) {
    const hasSession = hasSessionCookieInRequest(request);

    if (!hasSession) {
      const signInUrl = new URL('/auth/signin', request.url);
      const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      signInUrl.searchParams.set('redirect', redirectTarget);
      return NextResponse.redirect(signInUrl);
    }

    try {
      const verifyUrl = new URL('/api/push/test', request.url);
      const verifyResponse = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
        cache: 'no-store',
      });

      if (!verifyResponse.ok) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // --- Onboarding redirect for authenticated users ---
  // Only check on routes that are not already bypassed (onboarding, auth, api, public pages)
  const isBypassedForOnboarding = ONBOARDING_BYPASS_PREFIXES.some(
    prefix => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );

  if (
    !isBypassedForOnboarding &&
    stripped !== '/' &&
    hasSessionCookieInRequest(request)
  ) {
    // Handle ?skip_onboarding=true — set cookie and let the request through
    if (request.nextUrl.searchParams.get('skip_onboarding') === 'true') {
      response.cookies.set(ONBOARDING_SKIPPED_COOKIE, '1', {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
      });
      return response;
    }

    // If user already has either the completed or skipped cookie, no check needed
    const hasCompletedCookie = request.cookies.get(ONBOARDING_COMPLETED_COOKIE)?.value === '1';
    const hasSkippedCookie = request.cookies.get(ONBOARDING_SKIPPED_COOKIE)?.value === '1';

    if (!hasCompletedCookie && !hasSkippedCookie) {
      // Call the onboarding status API to check completion
      const completed = await checkOnboardingStatus(request);

      if (completed === true) {
        // Onboarding done — set cookie so we skip this check on future requests
        response.cookies.set(ONBOARDING_COMPLETED_COOKIE, '1', {
          path: '/',
          maxAge: 60 * 60 * 24 * 365, // 1 year
          httpOnly: true,
          sameSite: 'lax',
        });
      } else if (completed === false) {
        // Onboarding NOT completed — redirect to welcome
        const onboardingUrl = new URL('/onboarding/welcome', request.url);
        return NextResponse.redirect(onboardingUrl);
      }
      // If completed === null (check failed), fail open — let request through
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/'
  ]
};
