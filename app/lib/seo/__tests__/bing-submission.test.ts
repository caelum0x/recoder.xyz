import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BING_URLS_PER_RUN,
  isBingSubmissionEnabled,
  resolveBingApiKey,
  submitUrlsToBing,
} from '../bing-submission';

const ORIGINAL_ENV = { ...process.env };
const FAKE_KEY = 'test-bing-key-0000000000000000000'; // never a real key

/** A mock Bing response. GetUrlSubmissionQuota is a GET; SubmitUrlbatch a POST. */
function mockBing(quota: number | null, submitStatus: number): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: { method?: string }) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      // quota endpoint
      if (quota === null) return new Response('err', { status: 500 });
      return new Response(JSON.stringify({ d: { DailyQuota: quota } }), { status: 200 });
    }
    return new Response(null, { status: submitStatus });
  });
}

describe('seo/bing-submission', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BING_WEBMASTER_API_KEY;
    delete process.env.BING_ENABLE_IN_DEV;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('resolveBingApiKey', () => {
    it('returns null when unset/blank (no committed default — it is a secret)', () => {
      expect(resolveBingApiKey()).toBeNull();
      process.env.BING_WEBMASTER_API_KEY = '   ';
      expect(resolveBingApiKey()).toBeNull();
    });
    it('returns the trimmed env value when set', () => {
      process.env.BING_WEBMASTER_API_KEY = `  ${FAKE_KEY}  `;
      expect(resolveBingApiKey()).toBe(FAKE_KEY);
    });
  });

  describe('isBingSubmissionEnabled', () => {
    it('is false without a key regardless of env', () => {
      process.env = { ...process.env, NODE_ENV: 'production' };
      expect(isBingSubmissionEnabled()).toBe(false);
    });
    it('is true in production with a key', () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      process.env = { ...process.env, NODE_ENV: 'production' };
      expect(isBingSubmissionEnabled()).toBe(true);
    });
    it('is false in dev with a key unless BING_ENABLE_IN_DEV=1', () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      process.env = { ...process.env, NODE_ENV: 'test' };
      expect(isBingSubmissionEnabled()).toBe(false);
      process.env.BING_ENABLE_IN_DEV = '1';
      expect(isBingSubmissionEnabled()).toBe(true);
    });
  });

  describe('submitUrlsToBing', () => {
    it('skips truthfully when no key is set (no network call)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await submitUrlsToBing(['https://recoder.xyz/a']);
      expect(result.submitted).toBe(false);
      expect('reason' in result && result.reason).toContain('BING_WEBMASTER_API_KEY is not set');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when no valid same-host https URLs are provided', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      const result = await submitUrlsToBing(['http://recoder.xyz/insecure', 'https://evil.com/x']);
      expect(result.submitted).toBe(false);
      expect(result.urlCount).toBe(0);
    });

    it('submits and reports the upstream 200 verbatim', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      mockBing(100, 200);
      const result = await submitUrlsToBing(['https://recoder.xyz/blog/x']);
      expect(result.submitted).toBe(true);
      expect(result.upstreamStatus).toBe(200);
      expect(result.urlCount).toBe(1);
    });

    it('caps the batch to MAX_BING_URLS_PER_RUN', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      mockBing(null, 200); // quota unknown ⇒ fall back to run cap
      const many = Array.from({ length: MAX_BING_URLS_PER_RUN + 25 }, (_, i) => `https://recoder.xyz/p/${i}`);
      const result = await submitUrlsToBing(many);
      expect(result.submitted).toBe(true);
      expect(result.urlCount).toBe(MAX_BING_URLS_PER_RUN);
    });

    it('caps to the live remaining quota when smaller than the run cap', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      mockBing(3, 200);
      const many = Array.from({ length: 10 }, (_, i) => `https://recoder.xyz/q/${i}`);
      const result = await submitUrlsToBing(many);
      expect(result.submitted).toBe(true);
      expect(result.urlCount).toBe(3);
    });

    it('refuses to submit when remaining quota is 0', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      mockBing(0, 200);
      const result = await submitUrlsToBing(['https://recoder.xyz/a']);
      expect(result.submitted).toBe(false);
      expect('reason' in result && result.reason).toContain('quota is exhausted');
    });

    it('reports a non-2xx upstream verbatim, never fabricated', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      mockBing(100, 401);
      const result = await submitUrlsToBing(['https://recoder.xyz/a']);
      expect(result.submitted).toBe(false);
      expect(result.upstreamStatus).toBe(401);
    });

    it('never throws — a network error becomes submitted:false', async () => {
      process.env.BING_WEBMASTER_API_KEY = FAKE_KEY;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i: unknown, init?: { method?: string }) => {
        if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ d: { DailyQuota: 100 } }), { status: 200 });
        }
        throw new Error('network down');
      });
      const result = await submitUrlsToBing(['https://recoder.xyz/a']);
      expect(result.submitted).toBe(false);
      expect('reason' in result && result.reason).toContain('network down');
    });
  });
});
