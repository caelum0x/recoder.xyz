// @vitest-environment node
/**
 * Marketing template tests:
 *  - the winback footer must carry a SIGNED one-click unsubscribe link
 *    (recipients are plain user accounts with no newsletter_subscribers row),
 *  - the user display name is untrusted signup input and must be HTML-escaped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const SECRET_KEY = 'UNSUBSCRIBE_TOKEN_SECRET';
const savedSecret = process.env[SECRET_KEY];

beforeAll(() => {
  process.env[SECRET_KEY] = 'test-secret-for-unsubscribe-tokens';
});

afterAll(() => {
  if (savedSecret === undefined) delete process.env[SECRET_KEY];
  else process.env[SECRET_KEY] = savedSecret;
});

describe('generateWinbackEmail', () => {
  it('footer unsubscribe link is tokenized (email + HMAC sig)', async () => {
    const { generateWinbackEmail } = await import('./marketing-templates');
    const { verifyUnsubscribeSignature } = await import('./unsubscribe-token');

    const { html } = generateWinbackEmail({ to: 'Dormant@Example.com', name: 'Ada' });

    const match = html.match(/href="([^"]*\/api\/newsletter\/unsubscribe[^"]*)"/);
    expect(match).toBeTruthy();
    const url = new URL(match![1].replace(/&amp;/g, '&'));
    expect(url.searchParams.get('email')).toBe('dormant@example.com');
    const sig = url.searchParams.get('sig');
    expect(sig).toBeTruthy();
    expect(verifyUnsubscribeSignature('dormant@example.com', sig)).toBe(true);
  });

  it('HTML-escapes the user display name', async () => {
    const { generateWinbackEmail } = await import('./marketing-templates');

    const { html } = generateWinbackEmail({
      to: 'user@example.com',
      name: '<img src=x onerror=alert(1)>"O\'Brien"',
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;O&#39;Brien&quot;');
  });
});

describe('other marketing templates', () => {
  it('escape the display name too', async () => {
    const templates = await import('./marketing-templates');
    const evil = '<script>alert(1)</script>';

    const rendered = [
      templates.generateNewsletterEmail({
        to: 'u@example.com',
        name: evil,
        edition: 'Week 1',
        highlights: [],
      }).html,
      templates.generateProductUpdateEmail({
        to: 'u@example.com',
        name: evil,
        updateTitle: 'T',
        updateDescription: 'D',
        features: [],
      }).html,
      templates.generateFirstProjectEmail({
        to: 'u@example.com',
        name: evil,
        projectName: 'P',
      }).html,
    ];

    for (const html of rendered) {
      expect(html).not.toContain(evil);
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });
});
