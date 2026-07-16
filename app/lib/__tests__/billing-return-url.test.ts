// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveSafeCheckoutReturnUrl } from '@/lib/billing-return-url';

describe('resolveSafeCheckoutReturnUrl', () => {
  it('falls back when returnUrl is missing', () => {
    const result = resolveSafeCheckoutReturnUrl(undefined, {
      NEXT_PUBLIC_APP_URL: 'https://recoder.xyz',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(result).toBe('https://recoder.xyz/billing/success');
  });

  it('accepts same-origin returnUrl', () => {
    const result = resolveSafeCheckoutReturnUrl(
      'https://recoder.xyz/checkout/success?plan=pro',
      {
        NEXT_PUBLIC_APP_URL: 'https://recoder.xyz',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv
    );

    expect(result).toBe('https://recoder.xyz/checkout/success?plan=pro');
  });

  it('rejects cross-origin returnUrl', () => {
    const result = resolveSafeCheckoutReturnUrl(
      'https://evil.example/steal',
      {
        NEXT_PUBLIC_APP_URL: 'https://recoder.xyz',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv
    );

    expect(result).toBe('https://recoder.xyz/billing/success');
  });

  it('rejects non-http protocols', () => {
    const result = resolveSafeCheckoutReturnUrl(
      'javascript:alert(1)',
      {
        NEXT_PUBLIC_APP_URL: 'https://recoder.xyz',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv
    );

    expect(result).toBe('https://recoder.xyz/billing/success');
  });
});
