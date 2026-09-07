// @vitest-environment node
/**
 * Billing Change-Plan Route Tests
 * Tests POST /api/billing/subscription/change-plan
 *
 * Focus: the route wires provider.changePlan and gates DB mirroring on a
 * successful provider call (fail safe — never show a plan the customer is not
 * actually being billed for).
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

const mockChangePlan = vi.fn(async () => ({
  ok: true as const,
  subscription: { id: 'sub_provider_1', status: 'active', planId: 'pro', raw: {} },
}));
vi.mock('@/lib/payments/registry', () => ({
  getProvider: vi.fn(() => ({
    name: 'creem',
    configured: true,
    changePlan: mockChangePlan,
  })),
}));

import { POST } from '@/app/api/billing/subscription/change-plan/route';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/payments/registry';

const mockRequireAuth = vi.mocked(requireAuth);
const mockPrisma = vi.mocked(prisma);
const mockGetProvider = vi.mocked(getProvider);

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/billing/subscription/change-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const authedUser = {
  error: false,
  user: { id: 'user-1', email: 'test@example.com' },
} as any;

const activeSub = {
  id: 'db-sub-1',
  userId: 'user-1',
  provider: 'creem',
  providerId: 'sub_provider_1',
  planId: 'monthly',
  status: 'active',
};

describe('POST /api/billing/subscription/change-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangePlan.mockResolvedValue({
      ok: true as const,
      subscription: { id: 'sub_provider_1', status: 'active', planId: 'pro', raw: {} },
    });
    mockGetProvider.mockReturnValue({
      name: 'creem',
      configured: true,
      changePlan: mockChangePlan,
    } as any);
  });

  it('rejects an invalid or non-purchasable plan', async () => {
    mockRequireAuth.mockResolvedValue(authedUser);
    const res = await POST(buildRequest({ planId: 'free' }));
    expect(res.status).toBe(400);
    expect(mockChangePlan).not.toHaveBeenCalled();
  });

  it('changes the plan at the provider FIRST, then mirrors the new plan in the DB', async () => {
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionPlan: 'monthly',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(activeSub as any);
    mockPrisma.subscriptions.update.mockResolvedValue({} as any);
    mockPrisma.users.update.mockResolvedValue({} as any);
    mockPrisma.audit_logs.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest({ planId: 'pro' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.plan).toBe('pro');

    // Provider called with the provider-side id and the target plan.
    expect(mockChangePlan).toHaveBeenCalledWith('sub_provider_1', 'pro');

    // DB mirrors the new plan only after the provider confirmed.
    expect(mockPrisma.subscriptions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db-sub-1' },
        data: expect.objectContaining({ planId: 'pro' }),
      })
    );
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionPlan: 'pro' }),
      })
    );
  });

  it('FAILS LOUD (502) when the provider change fails — no DB change', async () => {
    mockChangePlan.mockResolvedValue({ ok: false as const, reason: 'creem_change_plan_failed' } as any);
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionPlan: 'monthly',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(activeSub as any);

    const res = await POST(buildRequest({ planId: 'pro' }));

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
      changePlan: mockChangePlan,
    } as any);
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: 'sub_provider_1',
      subscriptionPlan: 'monthly',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(activeSub as any);

    const res = await POST(buildRequest({ planId: 'pro' }));

    expect(res.status).toBe(503);
    expect(mockChangePlan).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('returns 409 requiresCheckout when the user has no active subscription', async () => {
    mockRequireAuth.mockResolvedValue(authedUser);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      subscriptionId: null,
      subscriptionPlan: 'free',
    } as any);
    mockPrisma.subscriptions.findFirst.mockResolvedValue(null);

    const res = await POST(buildRequest({ planId: 'pro' }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.requiresCheckout).toBe(true);
    expect(mockChangePlan).not.toHaveBeenCalled();
  });
});
