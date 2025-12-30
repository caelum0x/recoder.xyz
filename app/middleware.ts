import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Don't prefix the default locale in the URL
  localePrefix: 'as-needed'
});

export const config = {
  // Match all pathnames except for
  // - API routes
  // - Static files
  // - Internal Next.js paths
  matcher: [
    // Match all pathnames except for
    // - API routes (/api/...)
    // - Next.js internals (/_next/...)
    // - Static files (images, etc.)
    '/((?!api|_next|_vercel|.*\\..*).*)',
    // Always run for the root
    '/'
  ]
};
