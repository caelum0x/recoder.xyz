// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { getEmailProviderStatus, resolvePublicAppUrl, sanitizeEmailLink } from '@/lib/email';

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

describe('email provider selection', () => {
  it('prefers SMTP in auto mode when SMTP is configured', () => {
    const provider = getEmailProviderStatus({
      EMAIL_PROVIDER: 'auto',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'mailer@example.com',
      SMTP_PASSWORD: 'secret',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(provider.provider).toBe('smtp');
  });

  it('falls back to Resend in auto mode when SMTP is absent', () => {
    const provider = getEmailProviderStatus({
      EMAIL_PROVIDER: 'auto',
      RESEND_API_KEY: 're_test',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(provider.provider).toBe('resend');
  });

  it('uses dev mode when no provider is configured outside production', () => {
    const provider = getEmailProviderStatus({
      EMAIL_PROVIDER: 'auto',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(provider.provider).toBe('dev');
  });

  it('returns none in production when the requested provider is unavailable', () => {
    const provider = getEmailProviderStatus({
      EMAIL_PROVIDER: 'smtp',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(provider.provider).toBe('none');
  });
});
