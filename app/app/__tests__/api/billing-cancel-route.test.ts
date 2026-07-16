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

vi.mock('@/lib/billing-credentials', () => ({
  resolvePaddleVendorId: vi.fn(() => null),
  resolvePaddleAuthCode: vi.fn(() => null),
  resolveDodoApiKey: vi.fn(() => null),
}));

// Stub global fetch for external payment API calls
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
));

import { POST } from '@/app/api/billing/subscription/cancel/route';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

const mockRequireAuth = vi.mocked(requireAuth);
const mockPrisma = vi.mocked(prisma);

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
});
