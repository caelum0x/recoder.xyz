import { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';
import { locales } from '@/i18n/config';

// Marketing/public pages that support locale routing for SEO
const MARKETING_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'daily' as const },
  { path: '/about', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/support', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/careers', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/status', priority: 0.5, changeFrequency: 'daily' as const },
  { path: '/tutorials', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/legal', priority: 0.3, changeFrequency: 'monthly' as const },
];

// Public pages without locale support
const STATIC_ROUTES = [
  { path: '/agents-101', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/help', priority: 0.6, changeFrequency: 'weekly' as const },
  { path: '/help/credits', priority: 0.5, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url;
  const sitemapEntries: MetadataRoute.Sitemap = [];

  // Generate entries for each marketing route in all locales
  MARKETING_ROUTES.forEach((route) => {
    locales.forEach((locale) => {
      const url = locale === 'en'
        ? `${baseUrl}${route.path}`
        : `${baseUrl}/${locale}${route.path}`;

      sitemapEntries.push({
        url,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: Object.fromEntries(
            locales.map((loc) => [
              loc,
              loc === 'en' ? `${baseUrl}${route.path}` : `${baseUrl}/${loc}${route.path}`
            ])
          ),
        },
      });
    });
  });

  // Add static routes (no locale variants)
  STATIC_ROUTES.forEach((route) => {
    sitemapEntries.push({
      url: `${baseUrl}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    });
  });

  return sitemapEntries;
}

