/**
 * BillingService.handleWebhook event-name dispatch (recoder-kjyq).
 *
 * The provider normalizers emit DOT-form event types ('payment.failed' /
 * 'payment.succeeded'), but the unified switch had UNDERSCORE cases for payment
 * events — so a failed renewal hit `default` and never marked the account
 * past_due, leaving a paying-then-failing user with full paid access. This drives
 * the real handleWebhook over a fake prisma (signature bypassed) and proves the
 * dot-form payment events route to the correct handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const usersUpdate = vi.fn(async () => ({}));
const subsUpdateMany = vi.fn(async () => ({ count: 1 }));
const auditCreate = vi.fn(async () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: { update: (...a: unknown[]) => usersUpdate(...a) },
    subscriptions: { updateMany: (...a: unknown[]) => subsUpdateMany(...a) },
    audit_logs: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

import { billingService } from '@/lib/services/billing.service';

beforeEach(() => vi.clearAllMocks());

describe('BillingService.handleWebhook — normalized event-name dispatch', () => {
  it('routes a dot-form payment.failed to past_due (dunning NOT bypassed)', async () => {
    await billingService.handleWebhook(
      'dodo',
      { event_type: 'payment.failed', data: { customer_id: 'u1' } },
      '__already_verified__',
    );
    // The user + their active subscription are moved to past_due — not silently dropped.
    expect(usersUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { subscriptionStatus: 'past_due' } }),
    );
    expect(subsUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', status: 'active' } }),
    );
  });
});
