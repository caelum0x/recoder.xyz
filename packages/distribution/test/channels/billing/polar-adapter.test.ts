import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPolarBillingAdapter } from '../../../src/channels/billing/adapters/polar-billing-adapter';
import { createPlanCatalog } from '../../../src/channels/billing/plan-catalog';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { ENV_KEYS } from '../../../src/config/index';
import { FailSafeError } from '../../../src/errors/index';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** A mock fetch that records requests and returns a queued JSON body. */
function mockFetch(responder: (req: CapturedRequest) => { status: number; json: unknown }) {
  const captured: CapturedRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const req: CapturedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    captured.push(req);
    const { status, json } = responder(req);
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

test('polar adapter fails safe (deny + throw) when POLAR_ACCESS_TOKEN is absent', async () => {
  const secrets = createEnvSecretPort({}); // no token
  const { fetchImpl, captured } = mockFetch(() => ({ status: 200, json: {} }));
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });

  await assert.rejects(
    () =>
      adapter.startCheckout({
        subjectId: 'user_1',
        productId: 'prod_pro',
        successUrl: 'https://recoder.xyz/ok',
      }),
    (e) => e instanceof FailSafeError,
  );
  // No network call was made — fail safe BEFORE touching the wire.
  assert.equal(captured.length, 0);

  // health() reports the missing key truthfully.
  const health = await adapter.health();
  assert.equal(health.status, 'unhealthy');
  assert.match(health.reason ?? '', /POLAR_ACCESS_TOKEN/);
});

test('polar adapter shapes a real checkout request and parses the response', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const { fetchImpl, captured } = mockFetch((req) => {
    assert.ok(req.url.endsWith('/v1/checkouts/'));
    return { status: 200, json: { id: 'co_1', url: 'https://polar.sh/checkout/co_1' } };
  });
  const adapter = createPolarBillingAdapter({
    secrets,
    planCatalog: catalog,
    fetchImpl,
    apiBase: 'https://api.polar.sh',
  });

  const result = await adapter.startCheckout({
    subjectId: 'user_1',
    productId: 'prod_pro',
    successUrl: 'https://recoder.xyz/ok',
    customerEmail: 'dev@recoder.xyz',
  });
  assert.equal(result.checkoutId, 'co_1');
  assert.equal(result.url, 'https://polar.sh/checkout/co_1');

  const sent = captured[0]!;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.authorization, 'Bearer polar_tok');
  assert.deepEqual(sent.body, {
    product_id: 'prod_pro',
    success_url: 'https://recoder.xyz/ok',
    customer_email: 'dev@recoder.xyz',
    metadata: { recoder_subject: 'user_1' },
  });
});

test('polar adapter resolveEntitlements maps benefit grants and drops revoked', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const { fetchImpl } = mockFetch((req) => {
    assert.match(req.url, /\/v1\/customers\/user_1\/benefit-grants/);
    return {
      status: 200,
      json: {
        items: [
          { id: 'g1', is_granted: true, granted_at: '2026-06-01T00:00:00Z', benefit: { id: 'b1', type: 'feature_flag' } },
          { id: 'g2', is_granted: true, revoked_at: '2026-06-02T00:00:00Z', benefit: { id: 'b2', type: 'license_keys' } },
        ],
      },
    };
  });
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });
  const grants = await adapter.resolveEntitlements({ subjectId: 'user_1', kind: 'user' });
  assert.equal(grants.length, 1); // revoked dropped
  assert.equal(grants[0]!.kind, 'feature_flag');
  assert.equal(grants[0]!.key, 'b1');
  assert.equal(grants[0]!.granted, true);
});

test('polar adapter validateLicenseKey denies on a provider error, throws on missing key', async () => {
  // Missing key → fail safe throw (never a faked valid).
  const noKey = createPolarBillingAdapter({
    secrets: createEnvSecretPort({}),
    planCatalog: catalog,
    fetchImpl: mockFetch(() => ({ status: 200, json: {} })).fetchImpl,
  });
  await assert.rejects(() => noKey.validateLicenseKey('AAAA-BBBB'), (e) => e instanceof FailSafeError);

  // Provider 404 → valid:false with a reason, not a throw.
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const adapter = createPolarBillingAdapter({
    secrets,
    planCatalog: catalog,
    fetchImpl: mockFetch(() => ({ status: 404, json: { error: 'not found' } })).fetchImpl,
  });
  const res = await adapter.validateLicenseKey('AAAA-BBBB');
  assert.equal(res.valid, false);
  assert.ok(res.reason);
});

test('polar adapter emitUsage posts an idempotent usage event', async () => {
  const secrets = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' });
  const { fetchImpl, captured } = mockFetch((req) => {
    assert.ok(req.url.endsWith('/v1/events/ingest'));
    return { status: 200, json: {} };
  });
  const adapter = createPolarBillingAdapter({ secrets, planCatalog: catalog, fetchImpl });
  await adapter.emitUsage({
    subjectId: 'user_1',
    kind: 'cli_request',
    quantity: 1,
    idempotencyKey: 'idem-1',
    timestamp: '2026-06-28T00:00:00Z',
  });
  const body = captured[0]!.body as { events: Array<{ name: string; metadata: { idempotency_key: string } }> };
  assert.equal(body.events[0]!.name, 'cli_request');
  assert.equal(body.events[0]!.metadata.idempotency_key, 'idem-1');
});
