// @vitest-environment node
/**
 * Rate-limit guards on the genuinely-PUBLIC (unauthenticated) mutating routes.
 *
 * Each of these endpoints is reachable without a session, so an attacker can
 * flood/replay them. The guard is the FIRST thing every handler runs, so:
 *   - under the configured limit the request proceeds (a benign non-429 status),
 *   - past the limit it returns 429 before any real work happens.
 *
 * We drive the REAL rate limiter (not mocked). Its cache is keyed by
 * identifier + URL pathname, so a unique x-forwarded-for IP per route keeps the
 * buckets isolated. Only the two handlers whose benign path reaches a service
 * are stubbed (device init, paddle verify); every other route short-circuits on
 * input validation before touching a dependency.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimitConfigs } from '@/lib/middleware/rate-limit';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Device init is the one handler with no pre-service validation — stub the
// service so the under-limit calls resolve cleanly (200) instead of hitting a DB.
vi.mock('@/lib/services/cli-auth.service', () => ({
  CLIAuthService: {
    generateDeviceCode: vi.fn().mockResolvedValue({
      device_code: 'dev-code',
      user_code: 'ABCD-1234',
      verification_uri: 'https://recoder.xyz/cli/auth',
      verification_uri_complete: 'https://recoder.xyz/cli/auth?code=ABCD-1234',
      expires_in: 600,
      interval: 5,
    }),
    pollDeviceCode: vi.fn(),
    refreshAccessToken: vi.fn(),
    validateAccessToken: vi.fn(),
  },
}));

// Paddle: keep the signature check deterministic and env-independent. The
// route's real auth gate is this verify; we only assert the rate-limit guard.
vi.mock('@/lib/payments/registry', () => ({
  getProvider: () => ({
    verifyWebhook: () => ({ ok: false, reason: 'paddle_invalid_signature' }),
  }),
}));

vi.mock('@/lib/analytics', () => ({ emitSubscriptionCreated: vi.fn() }));

// auth/cli/route pulls Better Auth in at module load; its benign (invalid_action)
// path never calls it, but stub it so importing the route stays hermetic.
vi.mock('@/lib/auth-config', () => ({ auth: { api: { getSession: vi.fn() } } }));

function jsonRequest(url: string, ip: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Drive a POST handler `max + 1` times from a fixed IP: every call up to the
 * limit must NOT be 429 (the guard passes through to the real handler), and the
 * one past the limit must be exactly 429.
 */
async function assertThrottlesAt(
  handler: (req: NextRequest) => Promise<Response>,
  url: string,
  ip: string,
  body: unknown,
  max: number
): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const res = await handler(jsonRequest(url, ip, body));
    expect(res.status).not.toBe(429);
  }
  const throttled = await handler(jsonRequest(url, ip, body));
  expect(throttled.status).toBe(429);
  const payload = await throttled.json();
  expect(payload.error).toBe('Too many requests');
  expect(throttled.headers.get('Retry-After')).toBeTruthy();
}

describe('public POST routes are rate limited', () => {
  it('paddle/webhooks throttles at the webhook limit (unauth flood/retry guard)', async () => {
    const { POST } = await import('@/app/api/paddle/webhooks/route');
    // Empty body + no signature => verify fails => benign 401 under the limit.
    await assertThrottlesAt(
      POST,
      'http://localhost/api/paddle/webhooks',
      '10.0.0.1',
      '{}',
      rateLimitConfigs.webhook.maxRequests
    );
  });

  it('auth/cli/device throttles at the stricter cliAuth limit (device-code flooding)', async () => {
    const { POST } = await import('@/app/api/auth/cli/device/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/auth/cli/device',
      '10.0.0.2',
      {},
      rateLimitConfigs.cliAuth.maxRequests
    );
  });

  it('newsletter/subscribe throttles at the public limit (lead-signup spam)', async () => {
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    // Missing email => zod 400 under the limit, before any DB write.
    await assertThrottlesAt(
      POST,
      'http://localhost/api/newsletter/subscribe',
      '10.0.0.3',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('auth/key-validate throttles at the public limit (API-key brute force)', async () => {
    const { POST } = await import('@/app/api/auth/key-validate/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/auth/key-validate',
      '10.0.0.4',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('auth/cli/token throttles at the public limit (device-code/refresh brute force)', async () => {
    const { POST } = await import('@/app/api/auth/cli/token/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/auth/cli/token',
      '10.0.0.5',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('auth/cli/verify throttles at the public limit (token guessing)', async () => {
    const { POST } = await import('@/app/api/auth/cli/verify/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/auth/cli/verify',
      '10.0.0.6',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('auth/cli/verify throttles PER-IP even when each guess uses a distinct Bearer token', async () => {
    // The bypass this guards: keying the bucket on the token would give every
    // guess its own bucket. A brute-forcer sends N distinct tokens from ONE ip;
    // the ip-keyed limiter must still throttle at the public cap.
    const { POST } = await import('@/app/api/auth/cli/verify/route');
    const ip = '10.0.0.66';
    const distinctTokenReq = (i: number) =>
        new NextRequest('http://localhost/api/auth/cli/verify', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': ip,
                authorization: `Bearer reco_bruteforce_guess_${i}`,
            },
            body: '{}',
        });
    for (let i = 0; i < rateLimitConfigs.public.maxRequests; i += 1) {
        const res = await POST(distinctTokenReq(i));
        expect(res.status).not.toBe(429);
    }
    const throttled = await POST(distinctTokenReq(9999));
    expect(throttled.status).toBe(429);
  });

  it('auth/cli (multiplexed) throttles at the public limit (password/token flood)', async () => {
    const { POST } = await import('@/app/api/auth/cli/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/auth/cli',
      '10.0.0.7',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('user/api-keys/validate throttles at the public limit (provider-key flood)', async () => {
    const { POST } = await import('@/app/api/user/api-keys/validate/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/user/api-keys/validate',
      '10.0.0.8',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });

  it('user/openrouter/validate throttles at the public limit (provider-key flood)', async () => {
    const { POST } = await import('@/app/api/user/openrouter/validate/route');
    await assertThrottlesAt(
      POST,
      'http://localhost/api/user/openrouter/validate',
      '10.0.0.9',
      {},
      rateLimitConfigs.public.maxRequests
    );
  });
});
