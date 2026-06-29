import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

import { createPolarBillingAdapter } from '../../../src/channels/billing/adapters/polar-billing-adapter';
import { createPlanCatalog } from '../../../src/channels/billing/plan-catalog';
import { createBillingWebhookHandler } from '../../../src/channels/billing/webhook/index';
import { createEntitlementResolver } from '../../../src/channels/billing/entitlement-resolver';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { ENV_KEYS } from '../../../src/config/index';
import type { EventBusPort } from '../../../src/ports/event-bus-port';
import type { RunEvent } from '@recoder/agent-os';

/**
 * The checkout → webhook → entitlement linkage, end to end, with the REAL logic
 * on every hop and ONLY the Polar HTTP seam + the webhook signing secret mocked.
 *
 * This is the regression guard for the split-subject bug: a real payment must
 * reliably grant an entitlement to the SAME recoder subject that opened the
 * checkout. We prove that the subject id we register at checkout
 * (`external_customer_id`) is exactly the subject a downstream Polar webhook
 * resolves to, AND that the resolver then reads that subject's live grants back.
 */

const RECODER_SUBJECT = 'recoder_user_42';

const WEBHOOK_KEY = randomBytes(24);
const WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString('base64')}`;
const NOW = () => new Date('2026-06-29T00:00:00Z');
const TS = String(Math.floor(NOW().getTime() / 1000));

function signed(id: string, timestamp: string, body: string): string {
  const content = `${id}.${timestamp}.${body}`;
  const sig = createHmac('sha256', WEBHOOK_KEY).update(content).digest('base64');
  return `v1,${sig}`;
}

interface CapturedRequest {
  url: string;
  method: string;
  body?: unknown;
}

/** A mock fetch that records requests and routes by URL — the only Polar seam. */
function polarSeam(routes: (req: CapturedRequest) => { status: number; json: unknown }) {
  const captured: CapturedRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req: CapturedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    captured.push(req);
    const { status, json } = routes(req);
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, captured };
}

const catalog = createPlanCatalog([
  { plan: 'pro', polarProductId: 'prod_pro', displayName: 'Pro' },
]);

function capturingEvents() {
  const events: RunEvent[] = [];
  const bus: EventBusPort = { async emit(e) { events.push(e); } };
  return { bus, events };
}

test('checkout registers the recoder subject as the Polar external customer id', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const { fetchImpl, captured } = polarSeam(() => ({
    status: 200,
    json: { id: 'co_1', url: 'https://polar.sh/checkout/co_1' },
  }));
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });

  await adapter.startCheckout({
    subjectId: RECODER_SUBJECT,
    productId: 'prod_pro',
    successUrl: 'https://recoder.xyz/ok',
    customerEmail: 'buyer@recoder.xyz',
  });

  const body = captured[0]!.body as { external_customer_id: string; metadata: Record<string, unknown> };
  // The exact field Polar stamps onto the created customer → carried on every webhook.
  assert.equal(body.external_customer_id, RECODER_SUBJECT);
  assert.equal(body.metadata['recoder_subject'], RECODER_SUBJECT);
});

test('a signed order.paid webhook for that external customer grants an entitlement to the SAME subject', async () => {
  // The Polar webhook a real payment fires. Because checkout set
  // external_customer_id = RECODER_SUBJECT, Polar carries it back here.
  const webhookBody = JSON.stringify({
    type: 'order.paid',
    data: {
      id: 'order_1',
      external_customer_id: RECODER_SUBJECT,
      product_id: 'prod_pro',
      metadata: { recoder_subject: RECODER_SUBJECT },
    },
  });

  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: WEBHOOK_SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({
    secrets,
    events: bus,
    taskId: 'task_billing',
    eventId: () => 'evt_grant',
  });

  const res = await handler.process({
    rawBody: webhookBody,
    headers: { id: 'wh_order_1', timestamp: TS, signature: signed('wh_order_1', TS, webhookBody) },
    now: NOW,
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.change.kind, 'granted');
    // The load-bearing assertion: the subject granted === the checkout subject.
    assert.equal(res.value.change.subjectId, RECODER_SUBJECT);
    assert.equal(res.value.emitted, true);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0]!.data?.entitlementChange, 'granted');
  assert.equal(events[0]!.data?.subjectId, RECODER_SUBJECT);
});

test('webhook falls back to metadata.recoder_subject when external_customer_id is absent', async () => {
  // Defense in depth: even if Polar omits external_customer_id on a given event,
  // the redundant metadata anchor still resolves the SAME recoder subject.
  const webhookBody = JSON.stringify({
    type: 'subscription.active',
    data: {
      id: 'sub_1',
      product_id: 'prod_pro',
      metadata: { recoder_subject: RECODER_SUBJECT },
    },
  });

  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_WEBHOOK_SECRET]: WEBHOOK_SECRET });
  const { bus, events } = capturingEvents();
  const handler = createBillingWebhookHandler({ secrets, events: bus, taskId: 'task_billing', eventId: () => 'evt_2' });

  const res = await handler.process({
    rawBody: webhookBody,
    headers: { id: 'wh_sub_1', timestamp: TS, signature: signed('wh_sub_1', TS, webhookBody) },
    now: NOW,
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.change.kind, 'granted');
    assert.equal(res.value.change.subjectId, RECODER_SUBJECT);
  }
  assert.equal(events[0]!.data?.subjectId, RECODER_SUBJECT);
});

test('after payment, the entitlement resolver reads that subject\'s grants back through the gate', async () => {
  // The downstream consumer: createEntitlementResolver over the polar adapter.
  // The adapter now keys the read off the EXTERNAL id (= recoder subject), so
  // the grant created by the payment is the grant the gate honors.
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const { fetchImpl, captured } = polarSeam((req) => {
    assert.match(req.url, /\/v1\/customers\/external\/recoder_user_42\/state/);
    return {
      status: 200,
      json: {
        granted_benefits: [
          { id: 'gb1', benefit_id: 'pro_plan', benefit_type: 'plan', granted_at: '2026-06-29T00:00:00Z' },
        ],
      },
    };
  });
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });
  const resolver = createEntitlementResolver(adapter);

  const grants = await resolver.resolve({ subjectId: RECODER_SUBJECT, kind: 'user' });
  assert.equal(captured[0]!.method, 'GET');
  assert.equal(grants.length, 1);
  assert.equal(grants[0]!.granted, true);
  assert.equal(grants[0]!.subjectId, RECODER_SUBJECT);
});

test('an unpaid subject resolves to NO entitlements (fail-safe deny, not an error)', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  // No Polar customer for this external id yet → 404 → deny.
  const { fetchImpl } = polarSeam(() => ({ status: 404, json: { error: 'not found' } }));
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });
  const resolver = createEntitlementResolver(adapter);

  const grants = await resolver.resolve({ subjectId: 'never_paid', kind: 'user' });
  assert.deepEqual(grants, []);
});
