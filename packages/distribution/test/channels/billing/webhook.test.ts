import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

import {
  verifyWebhookSignature,
  createBillingWebhookHandler,
  webhookToEntitlementChange,
  classifyChange,
  PolarWebhookEnvelopeSchema,
} from '../../../src/channels/billing/webhook/index';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import type { EventBusPort } from '../../../src/ports/event-bus-port';
import type { RunEvent } from '@recoder/agent-os';
import { ENV_KEYS } from '../../../src/config/index';

const SECRET_KEY = randomBytes(24); // raw HMAC key
const SECRET = `whsec_${SECRET_KEY.toString('base64')}`;
const NOW = () => new Date('2026-06-28T00:00:00Z');
const TS = String(Math.floor(NOW().getTime() / 1000));

/** Build a valid Standard-Webhooks signature header for a body. */
function signed(id: string, timestamp: string, body: string): string {
  const content = `${id}.${timestamp}.${body}`;
  const sig = createHmac('sha256', SECRET_KEY).update(content).digest('base64');
  return `v1,${sig}`;
}

function bodyFor(type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    data: { id: 'obj_1', external_customer_id: 'org_1', product_id: 'prod_pro', ...extra },
  });
}

function capturingEvents() {
  const events: RunEvent[] = [];
  const bus: EventBusPort = { async emit(e) { events.push(e); } };
  return { bus, events };
}

test('verifyWebhookSignature accepts a correct signature and rejects tampering', () => {
  const body = bodyFor('order.paid');
  const okRes = verifyWebhookSignature({
    rawBody: body,
    headers: { id: 'wh_1', timestamp: TS, signature: signed('wh_1', TS, body) },
    secret: SECRET,
    now: NOW,
  });
  assert.equal(okRes.ok, true);

  // Tampered body → no match.
  const tampered = verifyWebhookSignature({
    rawBody: body + ' ',
    headers: { id: 'wh_1', timestamp: TS, signature: signed('wh_1', TS, body) },
    secret: SECRET,
    now: NOW,
  });
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.equal(tampered.error.code, 'webhook_untrusted');
});

test('verifyWebhookSignature denies a missing secret, missing headers, and replay', () => {
  const body = bodyFor('order.paid');

  const noSecret = verifyWebhookSignature({ rawBody: body, headers: { id: 'w', timestamp: TS, signature: 'v1,x' }, secret: '' });
  assert.equal(noSecret.ok, false);
  if (!noSecret.ok) assert.match(noSecret.error.message, /not configured/);

  const noHeaders = verifyWebhookSignature({ rawBody: body, headers: {}, secret: SECRET });
  assert.equal(noHeaders.ok, false);

  // Stale timestamp (1 hour old) → replay denial.
  const staleTs = String(Math.floor(NOW().getTime() / 1000) - 3600);
  const stale = verifyWebhookSignature({
    rawBody: body,
    headers: { id: 'w', timestamp: staleTs, signature: signed('w', staleTs, body) },
    secret: SECRET,
    now: NOW,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.error.message, /tolerance/);
});

test('classifyChange maps Polar types to entitlement directions', () => {
  assert.equal(classifyChange('order.paid'), 'granted');
  assert.equal(classifyChange('subscription.active'), 'granted');
  assert.equal(classifyChange('subscription.revoked'), 'revoked');
  assert.equal(classifyChange('order.refunded'), 'revoked');
  assert.equal(classifyChange('subscription.updated'), 'updated');
  assert.equal(classifyChange('something.else'), 'ignored');
});

test('webhookToEntitlementChange resolves the subject and ignores unknown subjects', () => {
  const granted = webhookToEntitlementChange(
    PolarWebhookEnvelopeSchema.parse(JSON.parse(bodyFor('order.paid'))),
  );
  assert.equal(granted.kind, 'granted');
  assert.equal(granted.subjectId, 'org_1');
  assert.equal(granted.productId, 'prod_pro');

  // Actionable type but NO subject → ignored (never apply to an unknown subject).
  const noSubject = webhookToEntitlementChange(
    PolarWebhookEnvelopeSchema.parse({ type: 'order.paid', data: {} }),
  );
  assert.equal(noSubject.kind, 'ignored');
  assert.match(noSubject.reason, /no resolvable recoder subject/);
});

test('handler verifies + maps + emits an entitlement-change RunEvent', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_1', eventId: () => 'evt_1' });

  const body = bodyFor('subscription.active');
  const res = await handler.process({
    rawBody: body,
    headers: { id: 'wh_42', timestamp: TS, signature: signed('wh_42', TS, body) },
    now: NOW,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.change.kind, 'granted');
    assert.equal(res.value.emitted, true);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0]!.data?.entitlementChange, 'granted');
  assert.equal(events[0]!.data?.subjectId, 'org_1');
});

test('handler denies when POLAR_WEBHOOK_SECRET is absent (fail safe — never trust the wire)', async () => {
  const secrets = createEnvSecretPort({}); // no secret
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_1' });

  const body = bodyFor('order.paid');
  const res = await handler.process({
    rawBody: body,
    headers: { id: 'wh_1', timestamp: TS, signature: signed('wh_1', TS, body) },
    now: NOW,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'webhook_untrusted');
  assert.equal(events.length, 0);
});

test('handler denies a forged signature and never emits', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_1' });

  const body = bodyFor('order.paid');
  const res = await handler.process({
    rawBody: body,
    headers: { id: 'wh_1', timestamp: TS, signature: 'v1,not-a-real-signature' },
    now: NOW,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'webhook_untrusted');
  assert.equal(events.length, 0);
});

test('handler dedupes a redelivered webhook id (no double-apply)', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_1', eventId: () => 'evt_1' });

  const body = bodyFor('order.paid');
  const headers = { id: 'wh_dup', timestamp: TS, signature: signed('wh_dup', TS, body) };

  const first = await handler.process({ rawBody: body, headers, now: NOW });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.value.emitted, true);

  const second = await handler.process({ rawBody: body, headers, now: NOW });
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.value.deduped, true);
    assert.equal(second.value.emitted, false);
  }
  assert.equal(events.length, 1); // emitted exactly once
});

test('handler acknowledges a non-actionable type without emitting', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_1' });

  const body = bodyFor('checkout.created');
  const res = await handler.process({
    rawBody: body,
    headers: { id: 'wh_x', timestamp: TS, signature: signed('wh_x', TS, body) },
    now: NOW,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.change.kind, 'ignored');
    assert.equal(res.value.emitted, false);
  }
  assert.equal(events.length, 0);
});
