// @vitest-environment node
/**
 * Billing Create Checkout Route Tests
 * Tests POST /api/billing/create-checkout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing route
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('@/lib/billing-credentials', () => ({
  resolvePaddleVendorId: vi.fn(() => 'vendor_123'),
  resolvePaddleAuthCode: vi.fn(() => 'auth_code_123'),
  resolveDodoApiKey: vi.fn(() => 'dodo_key_123'),
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: vi.fn(() => vi.fn(() => null)),
  rateLimitConfigs: { billing: {} },
}));

vi.mock('@/lib/email', () => ({
  resolvePublicAppUrl: vi.fn(() => 'https://recoder.xyz'),
}));

vi.mock('@/lib/services/dodopayments.service', () => ({
  DodoPaymentsService: {
    createCheckoutSession: vi.fn(() =>
      Promise.resolve({ checkoutUrl: 'https://checkout.dodo.test/session-1' })
    ),
  },
}));

// Stub global fetch for Paddle API calls
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      response: { url: 'https://checkout.paddle.test/pay-link-1' },
    }),
  })
));

import { POST } from '@/app/api/billing/create-checkout/route';
import { requireAuth } from '@/lib/auth-helpers';
import { resolvePaddleVendorId, resolvePaddleAuthCode, resolveDodoApiKey } from '@/lib/billing-credentials';
import { DodoPaymentsService } from '@/lib/services/dodopayments.service';

const mockRequireAuth = vi.mocked(requireAuth);
const mockResolvePaddleVendorId = vi.mocked(resolvePaddleVendorId);
const mockResolvePaddleAuthCode = vi.mocked(resolvePaddleAuthCode);
const mockResolveDodoApiKey = vi.mocked(resolveDodoApiKey);

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/billing/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/billing/create-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset credential mocks to valid defaults
    mockResolvePaddleVendorId.mockReturnValue('vendor_123');
    mockResolvePaddleAuthCode.mockReturnValue('auth_code_123');
    mockResolveDodoApiKey.mockReturnValue('dodo_key_123');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await POST(buildRequest({ plan: 'monthly', paymentMethod: 'paddle' }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when plan is missing', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ paymentMethod: 'paddle' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing plan or payment method');
  });

  it('returns 400 when payment method is missing', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ plan: 'monthly' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing plan or payment method');
  });

  it('returns 400 for invalid plan', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ plan: 'nonexistent_plan', paymentMethod: 'paddle' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid plan');
  });

  it('returns 400 for invalid payment method', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ plan: 'monthly', paymentMethod: 'stripe' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid payment method');
  });

  it('creates a Paddle checkout session successfully', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ plan: 'monthly', paymentMethod: 'paddle' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.provider).toBe('paddle');
    expect(data.checkoutUrl).toBe('https://checkout.paddle.test/pay-link-1');
  });

  it('creates a DODO checkout session successfully', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);

    const res = await POST(buildRequest({ plan: 'pro', paymentMethod: 'dodo' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.provider).toBe('dodo');
    expect(data.checkoutUrl).toBe('https://checkout.dodo.test/session-1');

    expect(DodoPaymentsService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      undefined,
      'https://recoder.xyz/checkout/success?plan=pro'
    );
  });

  it('returns 503 when Paddle credentials are not configured', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockResolvePaddleVendorId.mockReturnValue(null as any);
    mockResolvePaddleAuthCode.mockReturnValue(null as any);

    const res = await POST(buildRequest({ plan: 'monthly', paymentMethod: 'paddle' }));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('not configured');
  });

  it('returns 503 when DODO credentials are not configured', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockResolveDodoApiKey.mockReturnValue(null as any);

    const res = await POST(buildRequest({ plan: 'monthly', paymentMethod: 'dodo' }));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('not configured');
  });
});
