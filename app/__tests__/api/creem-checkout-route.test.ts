// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: (...args: unknown[]) => requireAuth(...args) }));

const getCreemProvider = vi.fn();
vi.mock('@/lib/services/creem.service', () => ({
  getCreemProvider: (...args: unknown[]) => getCreemProvider(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/billing/checkout/creem/route';

function makeRequest(body: unknown) {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as any;
}

function authedAs(user: { id: string; email: string }) {
  requireAuth.mockResolvedValue({ error: false, user });
}

beforeEach(() => {
  vi.clearAllMocks();
  authedAs({ id: 'user_1', email: 'u@example.com' });
});

describe('POST /api/billing/checkout/creem', () => {
  it('returns the auth error response for unauthenticated requests', async () => {
    requireAuth.mockResolvedValue({
      error: true,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ planId: 'monthly' }));
    expect(res.status).toBe(401);
  });

  it('rejects unknown and non-purchasable plans with 400', async () => {
    expect((await POST(makeRequest({ planId: 'yearly' }))).status).toBe(400);
    expect((await POST(makeRequest({ planId: 'free' }))).status).toBe(400);
    expect((await POST(makeRequest(null))).status).toBe(400);
    expect(getCreemProvider).not.toHaveBeenCalled();
  });

  it('creates a checkout from the pricing-config plan for the session user', async () => {
    const createCheckout = vi.fn().mockResolvedValue({
      ok: true,
      id: 'ch_1',
      checkoutUrl: 'https://creem.io/checkout/ch_1',
    });
    getCreemProvider.mockReturnValue({ createCheckout });

    const res = await POST(makeRequest({ planId: 'monthly' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      checkoutUrl: 'https://creem.io/checkout/ch_1',
      id: 'ch_1',
    });
    expect(createCheckout).toHaveBeenCalledWith({
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    });
  });

  it('degrades to 503 with the truthful reason when Creem is not configured', async () => {
    getCreemProvider.mockReturnValue({
      createCheckout: vi.fn().mockResolvedValue({ ok: false, reason: 'creem_not_configured' }),
    });

    const res = await POST(makeRequest({ planId: 'pro' }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.reason).toBe('creem_not_configured');
  });

  it('maps upstream checkout failures to 502 without faking success', async () => {
    getCreemProvider.mockReturnValue({
      createCheckout: vi.fn().mockResolvedValue({ ok: false, reason: 'creem_checkout_failed' }),
    });

    const res = await POST(makeRequest({ planId: 'monthly' }));

    expect(res.status).toBe(502);
    expect((await res.json()).success).toBe(false);
  });
});
