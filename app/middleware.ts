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

export default async function middleware(request: NextRequest) {
  const nextActionId = request.headers.get('next-action');
  if (request.method === 'POST' && nextActionId) {
    const isPlausibleActionId = /^[A-Za-z0-9_-]{20,}$/.test(nextActionId);
    if (!isPlausibleActionId) {
      return NextResponse.json({ error: 'Invalid Server Action id' }, { status: 400 });
    }
  }

  // Run i18n middleware first
  const response = intlMiddleware(request);

  // Check if route is protected
  const stripped = stripLocale(request.nextUrl.pathname);
  const isProtected = PROTECTED_PREFIXES.some(
    prefix => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );

  if (isProtected) {
    if (!hasSessionCookieInRequest(request)) {
      const signInUrl = new URL(`/auth/signin`, request.url);
      signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  const isAdminRoute = stripped === ADMIN_PREFIX || stripped.startsWith(`${ADMIN_PREFIX}/`);
  if (isAdminRoute) {
    const hasSession = hasSessionCookieInRequest(request);

    if (!hasSession) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
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

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/'
  ]
};
