// @vitest-environment node
/**
 * Billing Subscription Reactivate Route Tests
 * Tests POST /api/billing/subscription/reactivate
 *
 * Focus: the route reaches the payment provider and gates DB changes on a
 * successful provider reactivation (fail safe — never clear the cancellation
 * unless the provider actually resumed the subscription).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    audit_logs: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockReactivate = vi.fn(async () => ({ ok: true as const, status: 'active' }));
vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(() => ({
    name: 'creem',
    configured: true,
    reactivateSubscription: mockReactivate,
  })),
}));

import { POST } from '@/app/api/billing/subscription/reactivate/route';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/payments/registry';

const mockRequireAuth = vi.mocked(requireAuth);
const mockPrisma = vi.mocked(prisma);
const mockGetProvider = vi.mocked(getProvider);

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/billing/subscription/reactivate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

const authedUser = {
  error: false,
  user: { id: 'user-1', email: 'test@example.com' },
} as any;

const cancellingSub = {
  id: 'db-sub-1',
  userId: 'user-1',
  provider: 'creem',
  providerId: 'sub_provider_1',
  cancelAtPeriodEnd: true,
  status: 'cancelled',
  currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

describe('POST /api/billing/subscription/reactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReactivate.mockResolvedValue({ ok: true as const, status: 'active' });
    mockGetProvider.mockReturnValue({
      name: 'creem',
      configured: true,
      reactivateSubscription: mockReactivate,
    } as any);
  });

  it('reactivates through the provider FIRST, then clears the cancellation in the DB', async () => {
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionStatus: 'cancelling',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(cancellingSub as any);
    mockPrisma.subscriptions.update.mockResolvedValue({} as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // The provider reactivate is called with the PROVIDER-side id.
    expect(mockReactivate).toHaveBeenCalledWith('sub_provider_1');

    // DB cleared: subscription row + users mirror both flip back to active.
    expect(mockPrisma.subscriptions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db-sub-1' },
        data: expect.objectContaining({ cancelAtPeriodEnd: false, status: 'active' }),
      })
    );
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionStatus: 'active' }),
      })
    );
  });

  it('FAILS LOUD (502) when the provider reactivate fails — no DB change', async () => {
    mockReactivate.mockResolvedValue({ ok: false as const, reason: 'creem_reactivate_failed' } as any);
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionStatus: 'cancelling',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(cancellingSub as any);

    const res = await POST(buildRequest());

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.subscriptions.update).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('FAILS LOUD (503) when the provider is not configured — provider never called', async () => {
    mockGetProvider.mockReturnValue({
      name: 'creem',
      configured: false,
      reactivateSubscription: mockReactivate,
    } as any);
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionStatus: 'cancelling',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(cancellingSub as any);

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('returns 404 when there is no cancelled subscription to resume', async () => {
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionStatus: 'active',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue({
      ...cancellingSub,
      cancelAtPeriodEnd: false,
      status: 'active',
    } as any);

    const res = await POST(buildRequest());

    expect(res.status).toBe(404);
    expect(mockReactivate).not.toHaveBeenCalled();
  });
});
