import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/runtime-urls', () => ({
  resolveAgentsSiteUrl: vi.fn(() => 'https://agents.recoder.xyz'),
}));

vi.mock('@recoder/ecosystem-config', () => ({
  RECODER_ECOSYSTEM_URLS: {
    home: 'https://recoder.xyz',
    agency: 'https://agency.recoder.xyz',
    pm: 'https://pm.recoder.xyz',
    agents: 'https://agents.recoder.xyz',
  },
}));

describe('siteConfig', () => {
  it('exports a valid site config with expected structure', async () => {
    const { siteConfig } = await import('@/lib/site-config');

    expect(siteConfig.url).toBe('https://agents.recoder.xyz');
    expect(siteConfig.nav.links).toBeDefined();
    expect(siteConfig.nav.links.length).toBeGreaterThan(0);
    expect(siteConfig.hero.description).toContain('Recoder');
  });

  it('has footer links with all ecosystem URLs', async () => {
    const { siteConfig } = await import('@/lib/site-config');

    const ecosystemSection = siteConfig.footerLinks.find(
      (s) => s.title === 'Ecosystem'
    );
    expect(ecosystemSection).toBeDefined();
    expect(ecosystemSection!.links.length).toBeGreaterThanOrEqual(3);

    const urls = ecosystemSection!.links.map((l) => l.url);
    expect(urls).toContain('https://recoder.xyz');
    expect(urls).toContain('https://agency.recoder.xyz');
    expect(urls).toContain('https://pm.recoder.xyz');
  });

  it('has legal links pointing to recoder.xyz', async () => {
    const { siteConfig } = await import('@/lib/site-config');

    const legalSection = siteConfig.footerLinks.find(
      (s) => s.title === 'Legal'
    );
    expect(legalSection).toBeDefined();

    for (const link of legalSection!.links) {
      expect(link.url).toMatch(/^https:\/\/recoder\.xyz\//);
    }
  });

  it('has unique link IDs across all footer sections', async () => {
    const { siteConfig } = await import('@/lib/site-config');

    const allIds = siteConfig.footerLinks.flatMap((s) =>
      s.links.map((l) => l.id)
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('includes pricing tiers', async () => {
    const { siteConfig } = await import('@/lib/site-config');

    expect(siteConfig.cloudPricingItems).toBeDefined();
    expect(Array.isArray(siteConfig.cloudPricingItems)).toBe(true);
  });
});
