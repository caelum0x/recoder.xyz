// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// --- Mocks for the route's side-effect dependencies -------------------------

const prismaMock = {
  users: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
  audit_logs: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/middleware/rate-limit', () => ({
  // Under limit → returns null so the handler proceeds.
  rateLimit: () => async () => null,
  rateLimitConfigs: { webhook: {} },
}));

vi.mock('@/lib/email', () => ({
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendSubscriptionCancelledEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Spy on the conversion emitter — this is the dead-event wire under test.
const emitSubscriptionCreated = vi.fn();
vi.mock('@/lib/analytics', () => ({ emitSubscriptionCreated }));

// --- Helpers ----------------------------------------------------------------

const SECRET = 'test-dodo-secret';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeRequest(payload: string, signature: string) {
  return {
    headers: { get: (k: string) => (k === 'x-dodo-signature' ? signature : null) },
    text: async () => payload,
  } as any;
}

async function loadRoute() {
  process.env.DODO_WEBHOOK_SECRET = SECRET;
  vi.resetModules();
  return import('../route');
}

describe('POST /api/webhooks/dodo — SUBSCRIPTION_CREATED conversion wire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DODO_WEBHOOK_SECRET = SECRET;
  });

  it('fires SUBSCRIPTION_CREATED with real payload fields on a verified subscription.created', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'subscription.created',
      data: {
        user_id: 'user_abc',
        plan: 'monthly',
        subscription_id: 'sub_1',
        status: 'active',
        current_period_end: 1_800_000_000,
        amount: 20,
        currency: 'USD',
      },
    });

    const res = await POST(makeRequest(body, sign(body, SECRET)));

    expect(res.status).toBe(200);
    expect(emitSubscriptionCreated).toHaveBeenCalledTimes(1);
    expect(emitSubscriptionCreated).toHaveBeenCalledWith({
      userId: 'user_abc',
      planId: 'monthly',
      priceAmount: 20,
      currency: 'USD',
      provider: 'dodo',
    });
  });

  it('does NOT fire on an unverified (bad signature) webhook and returns 401', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'subscription.created',
      data: { user_id: 'user_abc', plan: 'monthly', subscription_id: 'sub_1' },
    });

    // Signed with the WRONG secret → same length, verification fails.
    const res = await POST(makeRequest(body, sign(body, 'wrong-secret')));

    expect(res.status).toBe(401);
    expect(emitSubscriptionCreated).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });

  it('does NOT fire for a non-subscription event (payment.succeeded)', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'payment.succeeded',
      data: { user_id: 'user_abc', amount: 20, currency: 'USD', transaction_id: 't1' },
    });

    const res = await POST(makeRequest(body, sign(body, SECRET)));

    expect(res.status).toBe(200);
    expect(emitSubscriptionCreated).not.toHaveBeenCalled();
  });
});
