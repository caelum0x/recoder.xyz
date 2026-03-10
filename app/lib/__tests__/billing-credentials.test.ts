// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { resolveDodoApiKey, resolvePaddleAuthCode, resolvePaddleVendorId } from '@/lib/billing-credentials';

describe('billing credential resolution', () => {
  it('resolves paddle vendor id with fallback', () => {
    vi.stubEnv('PADDLE_VENDOR_ID', '');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_VENDOR_ID', 'np_vendor');
    expect(resolvePaddleVendorId()).toBe('np_vendor');
    vi.unstubAllEnvs();
  });

  it('resolves paddle auth from PADDLE_AUTH_CODE then PADDLE_API_KEY', () => {
    vi.stubEnv('PADDLE_AUTH_CODE', 'auth_code');
    vi.stubEnv('PADDLE_API_KEY', 'api_key');
    expect(resolvePaddleAuthCode()).toBe('auth_code');

    vi.stubEnv('PADDLE_AUTH_CODE', '');
    expect(resolvePaddleAuthCode()).toBe('api_key');
    vi.unstubAllEnvs();
  });

  it('resolves dodo key from production live fallback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DODO_PAYMENTS_API_KEY', '');
    vi.stubEnv('DODO_API_KEY', '');
    vi.stubEnv('DODO_PAY_API_KEY', '');
    vi.stubEnv('DODO_API_KEY_LIVE', 'live_key');
    vi.stubEnv('DODO_API_KEY_TEST', 'test_key');
    expect(resolveDodoApiKey()).toBe('live_key');
    vi.unstubAllEnvs();
  });

  it('uses live/test keys before DODO_PAY_API_KEY in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DODO_PAYMENTS_API_KEY', '');
    vi.stubEnv('DODO_API_KEY', '');
    vi.stubEnv('DODO_API_KEY_LIVE', 'live_key');
    vi.stubEnv('DODO_PAY_API_KEY', 'legacy_pay_key');
    expect(resolveDodoApiKey()).toBe('live_key');
    vi.unstubAllEnvs();
  });

  it('resolves dodo key from non-production test fallback', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DODO_PAYMENTS_API_KEY', '');
    vi.stubEnv('DODO_API_KEY', '');
    vi.stubEnv('DODO_PAY_API_KEY', '');
    vi.stubEnv('DODO_API_KEY_TEST', 'test_key');
    vi.stubEnv('DODO_API_KEY_LIVE', 'live_key');
    expect(resolveDodoApiKey()).toBe('test_key');
    vi.unstubAllEnvs();
  });

  it('ignores placeholder values with inline comments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DODO_API_KEY_LIVE', 'your_live_api_key_here # obtained from dashboard');
    vi.stubEnv('DODO_PAY_API_KEY', 'your-dodo-pay-api-key');
    expect(resolveDodoApiKey()).toBeNull();
    vi.unstubAllEnvs();
  });
});
