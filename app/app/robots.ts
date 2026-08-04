import { MetadataRoute } from 'next';

/**
 * Canonical origin for the marketing/product site.
 *
 * Resolves from env so the deploy can override it, but always falls back to the
 * production origin — never localhost — so the emitted robots.txt/Sitemap
 * directive stays valid in every environment (AGENTS.md rule 4: no hardcoded
 * localhost in production paths).
 */
const CANONICAL_ORIGIN = 'https://recoder.xyz';

function resolveSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv && /^https:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/+$/, '');
  }
  return CANONICAL_ORIGIN;
}

/**
 * Authenticated / utility surfaces that must not be indexed. These stay in
 * lockstep with the sitemap: any path disallowed here is excluded from
 * `app/sitemap.ts` so robots and the sitemap agree (no indexable URL is also
 * disallowed). `/checkout` and `/verify` are conversion/utility surfaces and
 * are reconciled out of the indexable sitemap.
 */
const DISALLOWED_PATHS = [
  '/dashboard',
  '/account',
  '/billing',
  '/settings',
  '/api',
  '/onboarding',
  '/checkout',
  '/verify',
];

/**
 * robots.txt for recoder.xyz.
 *
 * Makes real the robots reference that `app/sitemap.ts` already assumes exists:
 * allows the public site, disallows the authed/utility surfaces, and points
 * crawlers at the canonical sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = resolveSiteOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
