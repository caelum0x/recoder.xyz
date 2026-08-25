import { MetadataRoute } from 'next';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = 'https://recoder.xyz';
const locales = ['en', 'tr', 'es', 'zh', 'de'] as const;
const defaultLocale = 'en';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface SitemapPage {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

/**
 * Build hreflang alternate links for every locale.
 * Default locale (en) maps to the bare path; others get /locale prefix.
 */
function buildAlternates(path: string) {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    languages[locale] = `${baseUrl}${prefix}${path}`;
  }
  // x-default points to the default locale version
  languages['x-default'] = `${baseUrl}${path}`;
  return { languages };
}

// ---------------------------------------------------------------------------
// Page registry – every public page with its SEO metadata
// ---------------------------------------------------------------------------

// ── Homepage ──────────────────────────────────────────────────────────────
const homepagePages: SitemapPage[] = [
  { path: '',                         changeFrequency: 'daily',   priority: 1.0 },
];

// ── Core marketing / product pages ────────────────────────────────────────
const corePages: SitemapPage[] = [
  { path: '/about',                   changeFrequency: 'monthly',  priority: 0.8 },
  { path: '/features',                changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/pricing',                 changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/enterprise',              changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/testimonials',            changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/case-studies',            changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/integrations',            changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/partnerships',            changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/changelog',               changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/design-partners',         changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/proof',                   changeFrequency: 'weekly',   priority: 0.6 },
  { path: '/blog',                    changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/alternatives',            changeFrequency: 'monthly',  priority: 0.8 },
];

// ── Blog posts ──────────────────────────────────────────────────────────
const blogPostPages: SitemapPage[] = [
  { path: '/blog/introducing-recoder-xyz',   changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/blog/why-we-built-byok',         changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/blog/cli-web-ide-cross-platform',changeFrequency: 'monthly',  priority: 0.6 },
];

// ── CLI pages ─────────────────────────────────────────────────────────────
// NOTE: '/cli' and '/cli/setup' were removed — no page.tsx backs those bare
// segments (only /cli/auth and /cli/authorize exist, and next.config has no
// rewrite/redirect for them), so they returned HTTP 404 and produced Google
// Search Console "Not found (404)" errors. Re-add them here only when real
// 200-OK pages ship. ('/docs/cli' below is a live docs route and stays.)
const cliPages: SitemapPage[] = [];

// ── Docs pages ────────────────────────────────────────────────────────────
const docsPages: SitemapPage[] = [
  { path: '/docs',                    changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/docs/getting-started',    changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/docs/faq',                changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/api-keys',           changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/api-keys/anthropic', changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/api-keys/openai',    changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/api-keys/openrouter',changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/byok',               changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/cli',                changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/models',             changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/docs/api-reference',     changeFrequency: 'weekly',   priority: 0.7 },
];

// ── Product / tool pages ──────────────────────────────────────────────────
const productPages: SitemapPage[] = [
  { path: '/agents',                  changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/tools',                   changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/learn',                   changeFrequency: 'weekly',   priority: 0.7 },
];

// ── Auth pages (publicly accessible) ──────────────────────────────────────
const authPages: SitemapPage[] = [
  { path: '/auth/signup',             changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/auth/signin',             changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/auth/register',           changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/auth/forgot-password',    changeFrequency: 'monthly',  priority: 0.4 },
];

// ── Support / contact ─────────────────────────────────────────────────────
const supportPages: SitemapPage[] = [
  { path: '/contact',                 changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/support',                 changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/faq',                     changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/feedback',                changeFrequency: 'monthly',  priority: 0.5 },
];

// ── Legal / trust / compliance ────────────────────────────────────────────
const legalPages: SitemapPage[] = [
  { path: '/terms',                   changeFrequency: 'monthly',  priority: 0.5 },
  { path: '/privacy',                 changeFrequency: 'monthly',  priority: 0.5 },
  { path: '/security',                changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/compliance',              changeFrequency: 'monthly',  priority: 0.5 },
  { path: '/legal/terms',             changeFrequency: 'monthly',  priority: 0.5 },
  { path: '/legal/privacy',           changeFrequency: 'monthly',  priority: 0.5 },
];

// ── Careers / press ───────────────────────────────────────────────────────
const companyPages: SitemapPage[] = [
  { path: '/careers',                 changeFrequency: 'weekly',   priority: 0.6 },
  { path: '/press',                   changeFrequency: 'monthly',  priority: 0.5 },
];

// NOTE: Dashboard, billing, settings, and onboarding pages are
// disallowed in robots.txt — do not include them in the sitemap.
//
// Reconcile with robots.ts (C1): `/checkout`, `/checkout/success`, and
// `/verify` are conversion/utility surfaces that robots.ts disallows, so they
// are intentionally excluded from this indexable sitemap. robots and the
// sitemap must agree — no indexable URL may also be disallowed.

// ── Misc pages ────────────────────────────────────────────────────────────
const miscPages: SitemapPage[] = [
  { path: '/analytics',               changeFrequency: 'daily',    priority: 0.5 },
  { path: '/plan',                    changeFrequency: 'monthly',  priority: 0.5 },
];

// ---------------------------------------------------------------------------
// Combine all page groups
// ---------------------------------------------------------------------------
const allPages: SitemapPage[] = [
  ...homepagePages,
  ...corePages,
  ...blogPostPages,
  ...cliPages,
  ...docsPages,
  ...productPages,
  ...authPages,
  ...supportPages,
  ...legalPages,
  ...companyPages,
  ...miscPages,
];

// ---------------------------------------------------------------------------
// lastModified truthfulness
// ---------------------------------------------------------------------------
// `new Date()` on every entry tells crawlers that every page changed on every
// build — a lie that erodes lastmod trust. Where a route is backed by a real
// source file we derive `lastModified` from that file's on-disk mtime (a real,
// verifiable signal); otherwise (dynamic routes, blog slugs with no matching
// dir) we fall back to the build-time date. Resolution is best-effort and
// wrapped so a missing/unreadable file never breaks sitemap generation.

const PAGE_EXTENSIONS = ['tsx', 'ts', 'mdx', 'md', 'jsx', 'js'] as const;
const LOCALE_ROUTE_ROOT = join(process.cwd(), 'app', '[locale]');

/**
 * Resolve the candidate source directory for a route path relative to the
 * localized app root. The homepage lives in the `(home)` route group; all
 * other routes map path→directory directly.
 */
function routeSourceDir(path: string): string {
  const segment = path === '' ? '(home)' : path.replace(/^\/+/, '');
  return join(LOCALE_ROUTE_ROOT, segment);
}

/**
 * Real last-modified date for a route, derived from its backing `page.*`
 * source file mtime when one exists. Returns `undefined` when no source file
 * is resolvable so the caller can fall back to the build date. Never throws.
 */
function sourceLastModified(path: string): Date | undefined {
  try {
    const dir = routeSourceDir(path);
    for (const ext of PAGE_EXTENSIONS) {
      const file = join(dir, `page.${ext}`);
      if (existsSync(file)) {
        return statSync(file).mtime;
      }
    }
  } catch {
    // Filesystem access is best-effort; degrade to the build date.
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Sitemap generator
// ---------------------------------------------------------------------------
export default function sitemap(): MetadataRoute.Sitemap {
  const buildDate = new Date();

  return allPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: sourceLastModified(page.path) ?? buildDate,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: buildAlternates(page.path),
  }));
}
