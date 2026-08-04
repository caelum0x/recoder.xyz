// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

// --- In-memory prisma fake: real upsert/findFirst/update semantics ----------

interface SubRow {
  id: string;
  userId: string;
  status: string;
  provider?: string;
  providerId?: string;
  planId?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  cancelledAt?: Date;
  [key: string]: unknown;
}

const subscriptionsStore = new Map<string, SubRow>();
const usersStore = new Map<string, Record<string, unknown>>();

const prismaMock = {
  subscriptions: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const existing = [...subscriptionsStore.values()].find((s) => s.userId === where.userId);
      if (existing) {
        const next = { ...existing, ...update };
        subscriptionsStore.set(existing.id, next);
        return next;
      }
      const created = { ...create };
      subscriptionsStore.set(created.id, created);
      return created;
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
  users: {
    update: vi.fn(async ({ where, data }: any) => {
      const existing = usersStore.get(where.id);
      if (!existing) throw new Error('Record not found');
      const next = { ...existing, ...data };
      usersStore.set(where.id, next);
      return next;
    }),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitConfigs: { webhook: {} },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Dynamic import so the vi.mock factories above see initialized locals
// (a static route import would evaluate them before `prismaMock` exists).
let POST: (request: any) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import('@/app/api/webhooks/creem/route'));
});

// --- Helpers ----------------------------------------------------------------

const SECRET = 'test-creem-webhook-secret';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeRequest(payload: string, signature: string | null) {
  return {
    headers: { get: (k: string) => (k === 'creem-signature' ? signature : null) },
    text: async () => payload,
  } as any;
}

const createdBody = JSON.stringify({
  eventType: 'subscription.active',
  object: {
    id: 'sub_1',
    status: 'active',
    metadata: {
      userId: 'user_1',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  subscriptionsStore.clear();
  usersStore.clear();
  usersStore.set('user_1', { id: 'user_1', subscriptionPlan: 'free', subscriptionStatus: 'active' });
  vi.stubEnv('CREEM_API_KEY', 'test_api_key');
  vi.stubEnv('CREEM_WEBHOOK_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/webhooks/creem', () => {
  it('rejects an invalid signature with 401 and performs no writes', async () => {
    const res = await POST(makeRequest(createdBody, sign(createdBody, 'wrong-secret')));

    expect(res.status).toBe(401);
    expect(prismaMock.subscriptions.upsert).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });

  it('returns 503 with a truthful reason when Creem env keys are missing', async () => {
    vi.stubEnv('CREEM_API_KEY', '');
    vi.stubEnv('CREEM_WEBHOOK_SECRET', '');

    const res = await POST(makeRequest(createdBody, sign(createdBody, SECRET)));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toBe('creem_not_configured');
    expect(prismaMock.subscriptions.upsert).not.toHaveBeenCalled();
  });

  it('upserts the subscriptions row and mirrors users.subscriptionPlan/Status on subscription.created', async () => {
    const res = await POST(makeRequest(createdBody, sign(createdBody, SECRET)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, processed: 'subscription.created' });

    expect(subscriptionsStore.size).toBe(1);
    const row = [...subscriptionsStore.values()][0];
    expect(row).toMatchObject({
      userId: 'user_1',
      status: 'active',
      provider: 'creem',
      providerId: 'sub_1',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    });

    expect(usersStore.get('user_1')).toMatchObject({
      subscriptionPlan: 'monthly',
      subscriptionStatus: 'active',
      subscriptionId: 'sub_1',
    });
  });

  it('is idempotent on redelivery: same event twice still yields exactly one row and the same state', async () => {
    const request = () => makeRequest(createdBody, sign(createdBody, SECRET));

    const first = await POST(request());
    const rowAfterFirst = { ...[...subscriptionsStore.values()][0] };
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(subscriptionsStore.size).toBe(1);
    const rowAfterSecond = [...subscriptionsStore.values()][0];
    expect(rowAfterSecond.id).toBe(rowAfterFirst.id);
    expect(rowAfterSecond).toMatchObject({
      userId: 'user_1',
      providerId: 'sub_1',
      planId: 'monthly',
      status: 'active',
    });
    expect(usersStore.get('user_1')).toMatchObject({
      subscriptionPlan: 'monthly',
      subscriptionStatus: 'active',
    });
  });

  it('marks the subscription and user cancelled on subscription.canceled (idempotently)', async () => {
    await POST(makeRequest(createdBody, sign(createdBody, SECRET)));

    const cancelBody = JSON.stringify({
      eventType: 'subscription.canceled',
      object: { id: 'sub_1', status: 'canceled' },
    });
    const cancel = () => makeRequest(cancelBody, sign(cancelBody, SECRET));

    const res = await POST(cancel());
    expect(res.status).toBe(200);

    const row = [...subscriptionsStore.values()][0];
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(usersStore.get('user_1')).toMatchObject({ subscriptionStatus: 'cancelled' });

    // Redelivered cancellation stays truthful and does not throw.
    const again = await POST(cancel());
    expect(again.status).toBe(200);
    expect([...subscriptionsStore.values()][0].status).toBe('cancelled');
  });

  it('records payment outcomes on the users mirror via the providerId lookup', async () => {
    await POST(makeRequest(createdBody, sign(createdBody, SECRET)));

    const paidBody = JSON.stringify({
      eventType: 'subscription.paid',
      object: { id: 'sub_1' },
    });
    const paidRes = await POST(makeRequest(paidBody, sign(paidBody, SECRET)));
    expect(paidRes.status).toBe(200);
    expect(usersStore.get('user_1')).toMatchObject({ paymentStatus: 'active' });
    expect((usersStore.get('user_1') as any).lastPaymentDate).toBeInstanceOf(Date);

    const failedBody = JSON.stringify({
      eventType: 'subscription.unpaid',
      object: { id: 'sub_1' },
    });
    const failedRes = await POST(makeRequest(failedBody, sign(failedBody, SECRET)));
    expect(failedRes.status).toBe(200);
    expect(usersStore.get('user_1')).toMatchObject({ paymentStatus: 'failed' });
  });

  it('acks event types we deliberately ignore without writing anything', async () => {
    const body = JSON.stringify({ eventType: 'dispute.created', object: { id: 'dp_1' } });

    const res = await POST(makeRequest(body, sign(body, SECRET)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, processed: null });
    expect(prismaMock.subscriptions.upsert).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });

  it('acks but does not write when subscription.created lacks metadata.userId', async () => {
    const body = JSON.stringify({
      eventType: 'subscription.active',
      object: { id: 'sub_orphan', status: 'active' },
    });

    const res = await POST(makeRequest(body, sign(body, SECRET)));

    expect(res.status).toBe(200);
    expect(prismaMock.subscriptions.upsert).not.toHaveBeenCalled();
    expect(prismaMock.users.update).not.toHaveBeenCalled();
  });
});
