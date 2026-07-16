// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { detectBillingHealth } from '@/lib/billing-health';

const asEnv = (value: Record<string, string>): NodeJS.ProcessEnv =>
  value as unknown as NodeJS.ProcessEnv;

describe('detectBillingHealth', () => {
  it('marks configured when Paddle checkout vars exist', () => {
    const health = detectBillingHealth(asEnv({ PADDLE_VENDOR_ID: 'vendor_123' }));
    expect(health.configured).toBe(true);
    expect(health.paddle.checkoutConfigured).toBe(true);
    expect(health.paddle.configured).toBe(true);
    expect(health.activeProvider).toBe('paddle');
  });

  it('marks configured when Dodo vars use PAY-prefixed naming', () => {
    const health = detectBillingHealth(asEnv({ DODO_PAY_API_KEY: 'secret' }));
    expect(health.configured).toBe(true);
    expect(health.dodo.checkoutConfigured).toBe(true);
    expect(health.dodo.configured).toBe(true);
    expect(health.activeProvider).toBe('dodo');
  });

  it('marks configured when Polar API key is set', () => {
    const health = detectBillingHealth(asEnv({ POLAR_API_KEY: 'pol_live_abc123' }));
    expect(health.configured).toBe(true);
    expect(health.polar.checkoutConfigured).toBe(true);
    expect(health.polar.configured).toBe(true);
    expect(health.activeProvider).toBe('polar');
  });

  it('marks not configured when no billing vars are set', () => {
    const health = detectBillingHealth(asEnv({}));
    expect(health.configured).toBe(false);
    expect(health.paddle.configured).toBe(false);
    expect(health.dodo.configured).toBe(false);
    expect(health.polar.configured).toBe(false);
    expect(health.activeProvider).toBe('none');
  });

  it('treats placeholder secrets as not configured', () => {
    const health = detectBillingHealth(asEnv({
      PADDLE_VENDOR_ID: 'your-paddle-vendor-id',
      DODO_API_KEY_LIVE: 'your_live_api_key_here # obtained from dashboard',
    }));
    expect(health.configured).toBe(false);
    expect(health.paddle.configured).toBe(false);
    expect(health.dodo.configured).toBe(false);
    expect(health.activeProvider).toBe('none');
  });

  it('respects explicit PAYMENT_PROVIDER env var', () => {
    const health = detectBillingHealth(asEnv({
      PAYMENT_PROVIDER: 'polar',
      POLAR_API_KEY: 'pol_live_abc123',
      DODO_API_KEY: 'dodo_key',
    }));
    expect(health.activeProvider).toBe('polar');
  });

  it('prefers Polar over Dodo in auto-detect when both are set', () => {
    const health = detectBillingHealth(asEnv({
      POLAR_API_KEY: 'pol_live_abc123',
      DODO_API_KEY: 'dodo_key',
    }));
    expect(health.activeProvider).toBe('polar');
  });

  it('sets activeProvider to none when explicitly disabled', () => {
    const health = detectBillingHealth(asEnv({
      PAYMENT_PROVIDER: 'none',
      POLAR_API_KEY: 'pol_live_abc123',
    }));
    expect(health.activeProvider).toBe('none');
    expect(health.configured).toBe(true); // keys exist, just disabled
  });
});
