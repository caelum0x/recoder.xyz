import { MetadataRoute } from 'next';

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
  { path: '/blog',                    changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/alternatives',            changeFrequency: 'monthly',  priority: 0.8 },
];

// ── Blog posts ──────────────────────────────────────────────────────────
const blogPostPages: SitemapPage[] = [
  { path: '/blog/introducing-recoder-xyz',   changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/blog/why-we-built-byok',         changeFrequency: 'monthly',  priority: 0.6 },
  { path: '/blog/cli-web-ide-cross-platform',changeFrequency: 'monthly',  priority: 0.6 },
];

// ── Platform pages ────────────────────────────────────────────────────────
const platformPages: SitemapPage[] = [
  { path: '/platform',                changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/platform/agency',         changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/api',            changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/chat',           changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/openclaw',       changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/pm',             changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/studio',         changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/web',            changeFrequency: 'weekly',   priority: 0.8 },
];

// ── CLI pages ─────────────────────────────────────────────────────────────
const cliPages: SitemapPage[] = [
  { path: '/cli',                     changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/cli/setup',               changeFrequency: 'monthly',  priority: 0.7 },
];

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
  { path: '/docs/web-cli-sync',       changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/docs/api-reference',     changeFrequency: 'weekly',   priority: 0.7 },
];

// ── Product / tool pages ──────────────────────────────────────────────────
const productPages: SitemapPage[] = [
  { path: '/agents',                  changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/tools',                   changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/playground',              changeFrequency: 'weekly',   priority: 0.7 },
  { path: '/mobile',                  changeFrequency: 'monthly',  priority: 0.7 },
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

// ── Misc pages ────────────────────────────────────────────────────────────
const miscPages: SitemapPage[] = [
  { path: '/analytics',               changeFrequency: 'daily',    priority: 0.5 },
  { path: '/plan',                    changeFrequency: 'monthly',  priority: 0.5 },
  { path: '/verify',                  changeFrequency: 'monthly',  priority: 0.3 },
  { path: '/checkout',                changeFrequency: 'monthly',  priority: 0.4 },
  { path: '/checkout/success',        changeFrequency: 'monthly',  priority: 0.3 },
];

// ---------------------------------------------------------------------------
// Combine all page groups
// ---------------------------------------------------------------------------
const allPages: SitemapPage[] = [
  ...homepagePages,
  ...corePages,
  ...blogPostPages,
  ...platformPages,
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
// Sitemap generator
// ---------------------------------------------------------------------------
export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date();

  return allPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: currentDate,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: buildAlternates(page.path),
  }));
}
