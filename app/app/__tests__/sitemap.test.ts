import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sitemap from '../sitemap';

const BASE = 'https://recoder.xyz';

// Utility/conversion surfaces reconciled OUT of the indexable sitemap in C2 so
// they agree with the robots.ts disallow list (C1).
const RECONCILED_OUT = ['/checkout', '/checkout/success', '/verify'];

// Authed surfaces robots.ts disallows — must never appear in the sitemap.
const AUTHED_PATHS = ['/dashboard', '/billing', '/settings', '/onboarding'];

describe('sitemap.ts (MetadataRoute.Sitemap)', () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it('emits only absolute https://recoder.xyz URLs', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${BASE}/`) || url === BASE).toBe(true);
    }
    expect(JSON.stringify(entries)).not.toContain('localhost');
    expect(JSON.stringify(entries)).not.toContain('http://');
  });

  it('lists the known public routes', () => {
    for (const path of ['', '/pricing', '/features', '/docs', '/blog', '/terms', '/privacy', '/cli']) {
      expect(urls).toContain(`${BASE}${path}`);
    }
  });

  it('no longer lists the reconciled utility surfaces (agree with robots disallow)', () => {
    for (const path of RECONCILED_OUT) {
      expect(urls).not.toContain(`${BASE}${path}`);
    }
  });

  it('never leaks authed surfaces', () => {
    for (const path of AUTHED_PATHS) {
      expect(urls).not.toContain(`${BASE}${path}`);
    }
  });

  it('emits hreflang alternates for every locale + x-default', () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      for (const locale of ['en', 'tr', 'es', 'zh', 'de', 'x-default']) {
        expect(languages[locale]).toBeDefined();
        expect(String(languages[locale]).startsWith(BASE)).toBe(true);
      }
    }
  });

  it('every entry carries a real Date lastModified', () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it('derives lastModified for a file-backed route from its source mtime (not new Date())', () => {
    const source = join(process.cwd(), 'app', '[locale]', 'terms', 'page.tsx');
    if (!existsSync(source)) {
      // Source layout changed; skip rather than assert a fabricated expectation.
      return;
    }
    const termsEntry = entries.find((e) => e.url === `${BASE}/terms`);
    expect(termsEntry).toBeDefined();
    expect((termsEntry!.lastModified as Date).getTime()).toBe(statSync(source).mtime.getTime());
  });
});
