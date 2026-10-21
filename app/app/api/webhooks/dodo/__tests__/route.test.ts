// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

// --- Mocks for the route's side-effect dependencies -------------------------

// In-memory subscriptions store with real upsert-by-userId semantics so the
// shared subscription-upsert path (C6) can be asserted for idempotency.
const subscriptionsStore = new Map<string, Record<string, unknown>>();

const prismaMock = {
  users: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
  audit_logs: { create: vi.fn().mockResolvedValue({}) },
  subscriptions: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const existing = [...subscriptionsStore.values()].find((s) => s.userId === where.userId);
      if (existing) {
        const next = { ...existing, ...update };
        subscriptionsStore.set(existing.id as string, next);
        return next;
      }
      subscriptionsStore.set(create.id, { ...create });
      return create;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        [...subscriptionsStore.values()].find((s) => s.providerId === where.providerId) ?? null
      );
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const existing = subscriptionsStore.get(where.id);
      if (!existing) throw new Error('Record not found');
      const next = { ...existing, ...data };
      subscriptionsStore.set(where.id, next);
      return next;
    }),
  },
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
const FIXED_NOW_MS = 1_700_000_000_000;
const FIXED_TIMESTAMP = String(Math.floor(FIXED_NOW_MS / 1000));
const WEBHOOK_ID = 'msg_1';

/** Standard Webhooks signing: HMAC-SHA256(secret, `${id}.${timestamp}.${body}`), base64, `v1,` prefixed. */
function sign(payload: string, secret: string, id: string = WEBHOOK_ID, timestamp: string = FIXED_TIMESTAMP): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${digest}`;
}

function makeRequest(
  payload: string,
  signature: string,
  id: string = WEBHOOK_ID,
  timestamp: string = FIXED_TIMESTAMP
) {
  const headers: Record<string, string> = {
    'webhook-signature': signature,
    'webhook-id': id,
    'webhook-timestamp': timestamp,
  };
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
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
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    subscriptionsStore.clear();
    process.env.DODO_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires SUBSCRIPTION_CREATED with real payload fields on a verified subscription.created', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'subscription.created',
      data: {
        metadata: { userId: 'user_abc' },
        customer: { customer_id: 'cus_1', email: 'u@example.com' },
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

  it('lands the subscriptions row through the shared upsert path, idempotently on redelivery', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'subscription.created',
      data: {
        metadata: { userId: 'user_abc' },
        customer: { customer_id: 'cus_1', email: 'u@example.com' },
        plan: 'monthly',
        subscription_id: 'sub_1',
        status: 'active',
        current_period_end: 1_800_000_000,
        amount: 20,
        currency: 'USD',
      },
    });
    const request = () => makeRequest(body, sign(body, SECRET));

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(subscriptionsStore.size).toBe(1);
    const row = [...subscriptionsStore.values()][0];
    expect(row).toMatchObject({
      userId: 'user_abc',
      status: 'active',
      provider: 'dodo',
      providerId: 'sub_1',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
    });
  });

  it('does NOT fire on an unverified (bad signature) webhook and returns 401', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'subscription.created',
      data: { metadata: { userId: 'user_abc' }, plan: 'monthly', subscription_id: 'sub_1' },
    });

    // Signed with the WRONG secret → same length, verification fails.
    const res = await POST(makeRequest(body, sign(body, 'wrong-secret')));

    expect(res.status).toBe(401);
    expect(emitSubscriptionCreated).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
    expect(prismaMock.subscriptions.upsert).not.toHaveBeenCalled();
  });

  it('does NOT fire for a non-subscription event (payment.succeeded)', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({
      type: 'payment.succeeded',
      data: { metadata: { userId: 'user_abc' }, amount: 20, currency: 'USD', transaction_id: 't1' },
    });

    const res = await POST(makeRequest(body, sign(body, SECRET)));

    expect(res.status).toBe(200);
    expect(emitSubscriptionCreated).not.toHaveBeenCalled();
  });
});
