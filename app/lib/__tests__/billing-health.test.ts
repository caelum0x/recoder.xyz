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
  });

  it('marks configured when Dodo vars use PAY-prefixed naming', () => {
    const health = detectBillingHealth(asEnv({ DODO_PAY_API_KEY: 'secret' }));
    expect(health.configured).toBe(true);
    expect(health.dodo.checkoutConfigured).toBe(true);
    expect(health.dodo.configured).toBe(true);
  });

  it('marks not configured when no billing vars are set', () => {
    const health = detectBillingHealth(asEnv({}));
    expect(health.configured).toBe(false);
    expect(health.paddle.configured).toBe(false);
    expect(health.dodo.configured).toBe(false);
  });

  it('treats placeholder secrets as not configured', () => {
    const health = detectBillingHealth(asEnv({
      PADDLE_VENDOR_ID: 'your-paddle-vendor-id',
      DODO_API_KEY_LIVE: 'your_live_api_key_here # obtained from dashboard',
    }));
    expect(health.configured).toBe(false);
    expect(health.paddle.configured).toBe(false);
    expect(health.dodo.configured).toBe(false);
  });
});
