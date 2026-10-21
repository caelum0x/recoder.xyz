// @vitest-environment node
/**
 * Billing Subscription Cancel Route Tests
 * Tests POST /api/billing/subscription/cancel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing route
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscriptions: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    audit_logs: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// The active payment provider (Creem) — cancellation MUST route through it and
// gate success on it. Default mock is a configured provider that cancels OK; the
// fail-loud tests override cancelSubscription / configured.
const mockCancelSubscription = vi.fn(async () => ({ ok: true as const, status: 'canceled' }));
vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(() => ({
    name: 'creem',
    configured: true,
    cancelSubscription: mockCancelSubscription,
  })),
}));

import { POST } from '@/app/api/billing/subscription/cancel/route';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/payments/registry';

const mockRequireAuth = vi.mocked(requireAuth);
const mockPrisma = vi.mocked(prisma);
const mockGetProvider = vi.mocked(getProvider);

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/billing/subscription/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/billing/subscription/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the default: a configured Creem provider that cancels successfully.
    mockCancelSubscription.mockResolvedValue({ ok: true as const, status: 'canceled' });
    mockGetProvider.mockReturnValue({
      name: 'creem',
      configured: true,
      cancelSubscription: mockCancelSubscription,
    } as any);
    // No subscriptions row by default — routes fall back to user.subscriptionId
    // / the global default provider, matching the existing tests below.
    mockPrisma.subscriptions.findFirst.mockResolvedValue(null);
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await POST(buildRequest({ reason: 'too expensive' }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 404 when user is not found in database', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue(null);

    const res = await POST(buildRequest({ reason: 'not needed' }));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('User not found');
  });

  it('returns 400 when user has no active subscription', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: null,
    } as any);

    const res = await POST(buildRequest({ reason: 'no sub' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No active subscription');
  });

  it('cancels subscription at end of billing period by default', async () => {
    const endDate = new Date('2026-04-01');
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_123',
      subscriptionEndDate: endDate,
      plan: 'pro',
    } as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest({ reason: 'switching provider', feedback: 'great product' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('will be cancelled');

    // The provider cancel MUST have been called with the stored subscription id
    // BEFORE the DB was marked cancelled.
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_123');

    // Verify subscription status is set to 'cancelling' (not immediate)
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          subscriptionStatus: 'cancelling',
          cancelReason: 'switching provider',
          cancelFeedback: 'great product',
        }),
      })
    );

    // Verify audit log was created
    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'subscription_cancelled',
          resource: 'billing',
        }),
      })
    );
  });

  it('cancels subscription immediately when cancelImmediate is true', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_456',
      subscriptionEndDate: new Date('2026-05-01'),
      plan: 'monthly',
    } as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest({ reason: 'done', cancelImmediate: true }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe('Subscription cancelled immediately');

    // Verify subscription status is set to 'cancelled' (immediate)
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'cancelled',
        }),
      })
    );

    // Verify audit log includes cancelImmediate flag
    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            cancelImmediate: true,
          }),
        }),
      })
    );
  });

  // --- fail-loud safety (recoder-sl5b): never report success / mark the DB
  // cancelled while the provider still charges the card ---

  it('FAILS LOUD when the provider cancel fails — no DB change, no success', async () => {
    mockCancelSubscription.mockResolvedValue({ ok: false as const, reason: 'creem_cancel_failed' } as any);
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_123',
      subscriptionEndDate: new Date('2026-04-01'),
      plan: 'pro',
    } as any);

    const res = await POST(buildRequest({ reason: 'too expensive' }));

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBeUndefined();
    expect(data.error).toMatch(/payment provider/i);
    // Critical: the DB was NOT marked cancelled while the card is still active.
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(mockPrisma.audit_logs.create).not.toHaveBeenCalled();
  });

  // --- per-subscription provider routing: a real Dodo subscriber must be
  // cancelled against Dodo, not whatever PAYMENT_PROVIDER happens to default
  // to (previously hardcoded to a single global `activeProviderName()`,
  // unlike change-plan/reactivate which already read `subscription.provider`) ---

  it('routes cancellation to the SUBSCRIPTION\'s own provider (dodo), not the global default', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_dodo_provider_id',
      subscriptionEndDate: new Date('2026-04-01'),
      plan: 'pro',
    } as any);
    // Dodo's own subscriptions row: internal id differs from the provider id
    // mirrored onto users.subscriptionId.
    mockPrisma.subscriptions.findFirst.mockResolvedValue({
      id: 'internal_sub_1',
      providerId: 'sub_dodo_provider_id',
      provider: 'dodo',
    } as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest({ reason: 'switching provider' }));

    expect(res.status).toBe(200);
    // getProvider must have been asked for 'dodo', never the 'creem' default.
    expect(mockGetProvider).toHaveBeenCalledWith('dodo');
    // Dodo's adapter resolves providerId itself — it takes OUR internal
    // subscriptions.id, not the provider-side id mirrored on users.subscriptionId.
    expect(mockCancelSubscription).toHaveBeenCalledWith('internal_sub_1');
  });

  it('falls back to the global default provider and providerId when no subscriptions row exists', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_legacy',
      subscriptionEndDate: new Date('2026-04-01'),
      plan: 'pro',
    } as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest({ reason: 'x' }));

    expect(res.status).toBe(200);
    expect(mockGetProvider).toHaveBeenCalledWith('creem');
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_legacy');
  });

  it('FAILS LOUD (503) when the provider is not configured — no DB change, no success', async () => {
    mockGetProvider.mockReturnValue({
      name: 'creem',
      configured: false,
      cancelSubscription: mockCancelSubscription,
    } as any);
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_123',
      plan: 'pro',
    } as any);

    const res = await POST(buildRequest({ reason: 'x' }));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBeUndefined();
    // The provider was never even asked to cancel, and nothing was mutated.
    expect(mockCancelSubscription).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});
