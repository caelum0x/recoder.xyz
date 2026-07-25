import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_INDEXNOW_KEY,
  buildIndexNowPayload,
  filterUrlsForHost,
  isIndexNowSubmissionEnabled,
  isValidIndexNowKey,
  resolveIndexNowKey,
  resolveSiteOrigin,
  siteUrlForPath,
  submitUrls,
} from '../indexnow';

const ORIGINAL_ENV = { ...process.env };

describe('seo/indexnow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INDEXNOW_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('isValidIndexNowKey', () => {
    it('accepts 8-128 char [a-zA-Z0-9-] keys', () => {
      expect(isValidIndexNowKey(DEFAULT_INDEXNOW_KEY)).toBe(true);
      expect(isValidIndexNowKey('abcd-1234')).toBe(true);
    });
    it('rejects too-short, too-long, or illegal-charset keys', () => {
      expect(isValidIndexNowKey('short')).toBe(false);
      expect(isValidIndexNowKey('has space here')).toBe(false);
      expect(isValidIndexNowKey('a'.repeat(129))).toBe(false);
    });
  });

  describe('resolveIndexNowKey', () => {
    it('returns the committed default when env is unset', () => {
      expect(resolveIndexNowKey()).toBe(DEFAULT_INDEXNOW_KEY);
    });
    it('returns a valid env override', () => {
      process.env.INDEXNOW_KEY = 'valid-override-key-123';
      expect(resolveIndexNowKey()).toBe('valid-override-key-123');
    });
    it('ignores an invalid env override and falls back to the default', () => {
      process.env.INDEXNOW_KEY = 'bad key!';
      expect(resolveIndexNowKey()).toBe(DEFAULT_INDEXNOW_KEY);
    });
  });

  describe('resolveSiteOrigin', () => {
    it('falls back to the canonical production origin (never localhost)', () => {
      expect(resolveSiteOrigin()).toBe('https://recoder.xyz');
    });
    it('accepts an https env override and strips trailing slashes', () => {
      process.env.SITE_URL = 'https://staging.recoder.xyz/';
      expect(resolveSiteOrigin()).toBe('https://staging.recoder.xyz');
    });
    it('ignores a non-https override', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
      expect(resolveSiteOrigin()).toBe('https://recoder.xyz');
    });
  });

  describe('filterUrlsForHost', () => {
    it('keeps only https URLs on the host and de-duplicates', () => {
      const out = filterUrlsForHost(
        [
          'https://recoder.xyz/a',
          'https://recoder.xyz/a',
          'http://recoder.xyz/b',
          'https://evil.example.com/c',
          42,
          'not a url',
        ],
        'recoder.xyz',
      );
      expect(out).toEqual(['https://recoder.xyz/a']);
    });
  });

  describe('siteUrlForPath', () => {
    it('builds an absolute URL on the canonical origin, adding a leading slash', () => {
      expect(siteUrlForPath('blog/foo')).toBe('https://recoder.xyz/blog/foo');
      expect(siteUrlForPath('/changelog')).toBe('https://recoder.xyz/changelog');
    });
    it('honors an https origin override', () => {
      process.env.SITE_URL = 'https://staging.recoder.xyz';
      expect(siteUrlForPath('/blog')).toBe('https://staging.recoder.xyz/blog');
    });
  });

  describe('isIndexNowSubmissionEnabled', () => {
    it('is enabled in production', () => {
      process.env = { ...process.env, NODE_ENV: 'production' };
      delete process.env.INDEXNOW_ENABLE_IN_DEV;
      expect(isIndexNowSubmissionEnabled()).toBe(true);
    });
    it('is disabled outside production by default', () => {
      process.env = { ...process.env, NODE_ENV: 'test' };
      delete process.env.INDEXNOW_ENABLE_IN_DEV;
      expect(isIndexNowSubmissionEnabled()).toBe(false);
    });
    it('can be forced on outside production via INDEXNOW_ENABLE_IN_DEV=1', () => {
      process.env = { ...process.env, NODE_ENV: 'development' };
      process.env.INDEXNOW_ENABLE_IN_DEV = '1';
      expect(isIndexNowSubmissionEnabled()).toBe(true);
    });
  });

  describe('buildIndexNowPayload', () => {
    it('builds the spec payload with keyLocation = origin/key.txt', () => {
      const payload = buildIndexNowPayload(['https://recoder.xyz/a'], 'https://recoder.xyz', 'thekey123');
      expect(payload).toEqual({
        host: 'recoder.xyz',
        key: 'thekey123',
        keyLocation: 'https://recoder.xyz/thekey123.txt',
        urlList: ['https://recoder.xyz/a'],
      });
    });
  });

  describe('submitUrls', () => {
    it('returns submitted:false without a network call when no valid URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await submitUrls(['https://evil.example.com/x']);
      expect(result.submitted).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects an over-cap batch without a network call', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const many = Array.from({ length: 10_001 }, (_, i) => `https://recoder.xyz/p/${i}`);
      const result = await submitUrls(many);
      expect(result.submitted).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs and returns submitted:true on a 2xx', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      const result = await submitUrls(['https://recoder.xyz/a']);
      expect(result).toEqual({ submitted: true, upstreamStatus: 200, urlCount: 1 });
    });

    it('never throws on a network error — returns submitted:false', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
      const result = await submitUrls(['https://recoder.xyz/a']);
      expect(result.submitted).toBe(false);
      expect('reason' in result && result.reason).toBe('boom');
    });
  });
});
