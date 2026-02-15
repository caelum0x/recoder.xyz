import { afterEach, describe, expect, it, vi } from 'vitest';
import { firecrawlDisabledError, isFirecrawlEnabled } from './firecrawl-control';

describe('firecrawl-control', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default', () => {
    vi.stubEnv('FIRECRAWL_ENABLED', '');
    expect(isFirecrawlEnabled()).toBe(false);
  });

  it('enables when FIRECRAWL_ENABLED=true', () => {
    vi.stubEnv('FIRECRAWL_ENABLED', 'true');
    expect(isFirecrawlEnabled()).toBe(true);
  });

  it('supports cloudflare context env value', () => {
    expect(
      isFirecrawlEnabled({
        cloudflare: {
          env: {
            FIRECRAWL_ENABLED: '1',
          },
        },
      }),
    ).toBe(true);
  });

  it('returns stable disabled payload', () => {
    expect(firecrawlDisabledError()).toMatchObject({
      success: false,
      code: 'FIRECRAWL_DISABLED',
    });
  });
});
