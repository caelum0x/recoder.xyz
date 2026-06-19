import { MetadataRoute } from 'next';

const baseUrl = 'https://recoder.xyz';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface SitemapPage {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

// NOTE: hreflang alternates are intentionally not emitted. The locale variants
// (/tr, /es, /zh, /de) currently fall back to English content, so advertising
// them as translated alternates would reinforce duplicate-content signals.
// Only the canonical English URLs are listed below.

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
  { path: '/enterprise',              changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/testimonials',            changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/case-studies',            changeFrequency: 'monthly',  priority: 0.7 },
  { path: '/customers',               changeFrequency: 'monthly',  priority: 0.7 },
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
  { path: '/blog/cli-spaces-cross-platform',  changeFrequency: 'monthly',  priority: 0.6 },
];

// ── Platform pages ────────────────────────────────────────────────────────
const platformPages: SitemapPage[] = [
  { path: '/platform',                changeFrequency: 'weekly',   priority: 0.9 },
  { path: '/platform/agents',         changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/agency',         changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/api',            changeFrequency: 'weekly',   priority: 0.8 },
  { path: '/platform/pm',             changeFrequency: 'weekly',   priority: 0.8 },
  // NOTE: /platform/web is intentionally omitted — it server-redirects to
  // /dashboard/spaces, so it must not be advertised as an indexable URL.
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

// Transactional/auth pages are intentionally omitted to avoid wasting crawl
// budget on routes that are noindex, ephemeral, or low-value in search.

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
  ...supportPages,
  ...legalPages,
  ...companyPages,
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
  }));
}
