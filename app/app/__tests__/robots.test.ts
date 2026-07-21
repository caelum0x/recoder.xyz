import robots from '../robots';

describe('robots.ts (MetadataRoute.Robots)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('allows the public site and disallows authed/utility surfaces', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.allow).toBe('/');
    const disallow = rules.disallow as string[];
    for (const path of [
      '/dashboard',
      '/billing',
      '/settings',
      '/api',
      '/onboarding',
      '/checkout',
      '/verify',
    ]) {
      expect(disallow).toContain(path);
    }
  });

  it('points crawlers at the canonical sitemap and host (never localhost)', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;

    const result = robots();

    expect(result.sitemap).toBe('https://recoder.xyz/sitemap.xml');
    expect(result.host).toBe('https://recoder.xyz');
    expect(JSON.stringify(result)).not.toContain('localhost');
  });

  it('honors an https NEXT_PUBLIC_SITE_URL override and strips trailing slashes', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.recoder.xyz/';

    const result = robots();

    expect(result.sitemap).toBe('https://staging.recoder.xyz/sitemap.xml');
    expect(result.host).toBe('https://staging.recoder.xyz');
  });

  it('ignores a non-https (e.g. localhost) env value and falls back to canonical', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    const result = robots();

    expect(result.sitemap).toBe('https://recoder.xyz/sitemap.xml');
    expect(result.host).toBe('https://recoder.xyz');
  });
});
