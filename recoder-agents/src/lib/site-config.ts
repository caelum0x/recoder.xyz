import { pricingTiers, type PricingTier } from '@/lib/pricing-config';
import { RECODER_ECOSYSTEM_URLS } from '@recoder/ecosystem-config';
import { resolveAgentsSiteUrl } from '@/lib/runtime-urls';

// Re-export for backward compatibility
export type { PricingTier } from '@/lib/pricing-config';

export const siteConfig = {
  url: resolveAgentsSiteUrl(),
  nav: {
    links: [
      { id: 1, name: 'Home', href: '/' },
    ],
  },
  hero: {
    description:
      'Recoder – open-source platform to build, manage and train your AI Workforce.',
  },
  cloudPricingItems: pricingTiers,
  footerLinks: [
    {
      title: 'Recoder',
      links: [
        { id: 1, title: 'Support', url: '/support' },
        { id: 2, title: 'Contact', url: 'mailto:support@recoder.xyz' },
      ],
    },
    {
      title: 'Ecosystem',
      links: [
        { id: 3, title: 'Recoder Home', url: RECODER_ECOSYSTEM_URLS.home },
        { id: 4, title: 'Recoder Agency', url: RECODER_ECOSYSTEM_URLS.agency },
        { id: 5, title: 'Recoder PM', url: RECODER_ECOSYSTEM_URLS.pm },
      ],
    },
    {
      title: 'Legal',
      links: [
        { id: 8, title: 'Privacy Policy', url: RECODER_ECOSYSTEM_URLS.home + '/privacy' },
        { id: 9, title: 'Terms of Service', url: RECODER_ECOSYSTEM_URLS.home + '/terms' },
      ],
    },
  ],
};

export type SiteConfig = typeof siteConfig;
