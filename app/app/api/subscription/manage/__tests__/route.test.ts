// @vitest-environment node
/**
 * POST /api/subscription/manage — client-driven plan elevation guard (P1).
 *
 * A client must never be able to grant itself a PAID plan by POSTing a planId:
 * a paid `subscriptionPlan` may only be written by a verified provider payment
 * webhook. This test proves the route refuses to elevate to a paid plan and
 * never touches the durable subscription/user rows on such a request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

const prismaMock = vi.hoisted(() => ({
  users: { findUnique: vi.fn(), update: vi.fn() },
  subscription_plans: { findUnique: vi.fn(), findMany: vi.fn() },
  subscriptions: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/subscription/manage/route';
import { requireAuth } from '@/lib/auth-helpers';

const mockRequireAuth = vi.mocked(requireAuth);

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/subscription/manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/subscription/manage — paid elevation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'u1', email: 'user@example.com' },
    } as never);
    prismaMock.subscription_plans.findUnique.mockResolvedValue({ id: 'pro-monthly', active: true });
    prismaMock.users.findUnique.mockResolvedValue({ id: 'u1', email: 'user@example.com' });
  });

  it('refuses to elevate to a paid plan from a client request body', async () => {
    const res = await POST(buildRequest({ action: 'upgrade', planId: 'pro-monthly' }));
    expect(res.status).not.toBe(200);
    // No durable write may occur.
    expect(prismaMock.subscriptions.create).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });

  it('also refuses enterprise elevation', async () => {
    prismaMock.subscription_plans.findUnique.mockResolvedValue({ id: 'enterprise', active: true });
    const res = await POST(buildRequest({ action: 'change', planId: 'enterprise' }));
    expect(res.status).not.toBe(200);
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });

  it('permits a downgrade to the free plan', async () => {
    prismaMock.subscription_plans.findUnique.mockResolvedValue({ id: 'free', active: true });
    prismaMock.subscriptions.create.mockResolvedValue({ id: 'sub1' });
    prismaMock.users.update.mockResolvedValue({ id: 'u1' });
    const res = await POST(buildRequest({ action: 'downgrade', planId: 'free' }));
    expect(res.status).toBe(200);
  });
});
