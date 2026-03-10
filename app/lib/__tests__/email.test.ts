// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolvePublicAppUrl, sanitizeEmailLink } from '@/lib/email';

describe('email URL safety helpers', () => {
  it('falls back to canonical origin for invalid APP URL', () => {
    expect(resolvePublicAppUrl({ APP_URL: '://bad-url', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('https://recoder.xyz');
  });

  it('rejects localhost APP URL in production', () => {
    const url = resolvePublicAppUrl({ APP_URL: 'http://localhost:3000', NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(url).toBe('https://recoder.xyz');
  });

  it('keeps localhost APP URL outside production', () => {
    const url = resolvePublicAppUrl({ APP_URL: 'http://localhost:3000', NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(url).toBe('http://localhost:3000');
  });

  it('rejects localhost NEXT_PUBLIC_APP_URL in production', () => {
    const url = resolvePublicAppUrl({
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000/base',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(url).toBe('https://recoder.xyz');
  });

  it('rewrites localhost email links to public app URL in production', () => {
    const safe = sanitizeEmailLink('http://localhost:3000/auth/reset-password?token=abc', '/auth/forgot-password', {
      appUrl: 'https://recoder.xyz',
      nodeEnv: 'production',
    });
    expect(safe).toBe('https://recoder.xyz/auth/reset-password?token=abc');
  });

  it('falls back for non-http protocols', () => {
    const safe = sanitizeEmailLink('javascript:alert(1)', '/auth/signin', {
      appUrl: 'https://recoder.xyz',
      nodeEnv: 'production',
    });
    expect(safe).toBe('https://recoder.xyz/auth/signin');
  });
});
