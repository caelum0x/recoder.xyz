import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDistributionEngine,
  createChannelRegistry,
} from '../../src/engine/distribution-engine';
import type { ChannelPublisher } from '../../src/engine/channel-publisher';
import { createEntitlementResolver } from '../../src/channels/billing/entitlement-resolver';
import type { BillingPort } from '../../src/ports/billing-port';
import type { ApprovalPort } from '../../src/ports/approval-port';
import type { Approval } from '@recoder/agent-os';
import type { DeliveryRequest } from '../../src/domain/delivery';
import type { Plan } from '../../src/domain/subscription-plan';
import { healthy, unhealthy } from '../../src/domain/health-state';

function billingStub(grantsFeature = true): BillingPort {
  return {
    startCheckout: async () => ({ checkoutId: 'c', url: 'https://polar.sh/c' }),
    resolveEntitlements: async (s) =>
      grantsFeature
        ? [{ subjectId: s.subjectId, kind: 'feature_flag', key: 'publish_site', plan: 'free', granted: true }]
        : [],
    getQuota: async (s, kind) => ({ subjectId: s.subjectId, kind, limit: 0, remaining: 0, resetAt: '' }),
    emitUsage: async () => {},
    validateLicenseKey: async () => ({ valid: false }),
    health: async () => healthy(),
  };
}

/** A faux approval authority. Distribution never decides — this stands in for governance. */
function approvalStub(decision?: Approval['status']): ApprovalPort & { requested: Approval[] } {
  const requested: Approval[] = [];
  return {
    requested,
    async requestApproval(input) {
      const a: Approval = {
        approvalId: `appr_${requested.length + 1}`,
        taskId: input.taskId,
        status: 'pending',
        reason: input.reason,
        requestedBy: input.requestedBy,
        requestedAt: new Date().toISOString(),
        requiredAt: 'before_sensitive_action',
      };
      requested.push(a);
      return a;
    },
    async getApproval(id) {
      if (!decision) return null;
      return {
        approvalId: id,
        taskId: 't1',
        status: decision,
        reason: 'r',
        requestedBy: 'gov',
        requestedAt: new Date().toISOString(),
        requiredAt: 'before_sensitive_action',
      };
    },
  };
}

function publisherFor(channel: DeliveryRequest['channel'], healthOk = true): ChannelPublisher & { published: boolean } {
  const pub = {
    published: false,
    channel,
    async publish() {
      pub.published = true;
      return { url: `https://recoder.xyz/${channel}/x`, sha256: 'a'.repeat(64) };
    },
    async verify() {
      return healthOk ? healthy() : unhealthy('surface not responding');
    },
    async health() {
      return healthy();
    },
  };
  return pub;
}

function request(channel: DeliveryRequest['channel'], over: Partial<DeliveryRequest> = {}): DeliveryRequest {
  return {
    requestId: `req_${Math.random().toString(36).slice(2)}`,
    artifactId: 'art_1',
    taskId: 't1',
    channel,
    actor: { subjectId: 'user_1', kind: 'user' },
    idempotencyKey: `idem_${Math.random().toString(36).slice(2)}`,
    ...over,
  };
}

function engineWith(
  billing: BillingPort,
  approvals: ApprovalPort,
  plan: Plan,
  publishers: ChannelPublisher[],
  extra: Partial<Parameters<typeof createDistributionEngine>[0]> = {},
) {
  const registry = createChannelRegistry();
  for (const p of publishers) registry.register(p);
  return createDistributionEngine({
    registry,
    resolver: createEntitlementResolver(billing),
    approvals,
    resolveActorPlan: async () => plan,
    ...extra,
  });
}

test('customer-visible delivery PAUSES on approval and never self-approves', async () => {
  const pub = publisherFor('web_site');
  const approvals = approvalStub(); // getApproval returns null (pending world)
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub]);

  const receipt = await engine.deliver(request('web_site'));
  assert.equal(receipt.status, 'pending_approval');
  assert.equal(receipt.errorCode, 'approval_required');
  assert.equal(pub.published, false, 'must not publish before approval');
  assert.equal(approvals.requested.length, 1, 'an approval was requested, not granted');
  assert.ok(receipt.approvalRef);
});

test('approved delivery proceeds, verifies healthy, and produces a completed receipt', async () => {
  const pub = publisherFor('web_site', true);
  const approvals = approvalStub('approved');
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub]);

  const receipt = await engine.deliver(request('web_site', { approvalRef: 'appr_pre' }));
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.health.status, 'ok');
  assert.equal(pub.published, true);
  assert.ok(receipt.url?.startsWith('https://recoder.xyz/web_site/'));
  assert.equal(receipt.sha256, 'a'.repeat(64));
});

test('rejected approval ends the delivery as failed (cannot bypass the gate)', async () => {
  const pub = publisherFor('homebrew');
  const approvals = approvalStub('rejected');
  const engine = engineWith(billingStub(true), approvals, 'enterprise', [pub]);

  const receipt = await engine.deliver(request('homebrew', { approvalRef: 'appr_pre' }));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.errorCode, 'approval_rejected');
  assert.equal(pub.published, false);
});

test('entitlement gate denies a delivery the actor is not entitled to (fail safe)', async () => {
  const pub = publisherFor('web_site');
  const approvals = approvalStub('approved');
  // free plan, no grant → not entitled to publish_site.
  const engine = engineWith(billingStub(false), approvals, 'free', [pub]);

  const receipt = await engine.deliver(request('web_site', { approvalRef: 'appr_pre' }));
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.errorCode, 'entitlement_denied');
  assert.equal(pub.published, false, 'denied before approval/publish');
});

test('failed verification downgrades to failed, never a faked completion', async () => {
  const pub = publisherFor('web_site', false); // verify returns unhealthy
  const approvals = approvalStub('approved');
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub]);

  const receipt = await engine.deliver(request('web_site', { approvalRef: 'appr_pre' }));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.errorCode, 'preview_unhealthy');
  assert.notEqual(receipt.health.status, 'ok');
});

test('idempotency: a retried delivery returns the prior receipt, never double-publishes', async () => {
  const pub = publisherFor('download'); // download: no approval required
  const approvals = approvalStub('approved');
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub]);

  const req = request('download');
  const first = await engine.deliver(req);
  assert.equal(first.status, 'completed');
  // Same idempotency key → same receipt, no second publish.
  pub.published = false;
  const second = await engine.deliver(req);
  assert.equal(second.requestId, first.requestId);
  assert.equal(pub.published, false);
});

test('a throwing event bus never crashes a completed delivery (best-effort fire-back)', async () => {
  const pub = publisherFor('download'); // download: no approval required
  const approvals = approvalStub('approved');
  const seen: unknown[] = [];
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub], {
    events: {
      emit: async () => {
        throw new Error('outbox unreachable');
      },
    },
    onEmitError: (err) => seen.push(err),
  });

  // The outbox is down, but publish succeeded → the caller must still get the
  // truthful completed receipt, not a thrown error.
  const receipt = await engine.deliver(request('download'));
  assert.equal(receipt.status, 'completed');
  assert.equal(pub.published, true);
  assert.equal(seen.length, 1, 'emit error handed to onEmitError, not thrown');
  assert.ok(seen[0] instanceof Error);
});

test('a throwing event bus never crashes a failed-receipt path either', async () => {
  const pub = publisherFor('web_site', false); // verify unhealthy → failed receipt
  const approvals = approvalStub('approved');
  const seen: unknown[] = [];
  const engine = engineWith(billingStub(true), approvals, 'pro', [pub], {
    events: {
      emit: async () => {
        throw new Error('outbox unreachable');
      },
    },
    onEmitError: (err) => seen.push(err),
  });

  const receipt = await engine.deliver(request('web_site', { approvalRef: 'appr_pre' }));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.errorCode, 'preview_unhealthy');
  assert.equal(seen.length, 1, 'truthful failed receipt survives a down outbox');
});

test('unknown channel fails safe (no publisher → failed, never pretend success)', async () => {
  const approvals = approvalStub('approved');
  const engine = engineWith(billingStub(true), approvals, 'pro', []); // no publishers
  const receipt = await engine.deliver(request('npm'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.errorCode, 'provider_unavailable');
});
