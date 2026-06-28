import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEntitlementResolver } from '../../../src/channels/billing/entitlement-resolver';
import { createEntitlementCache } from '../../../src/channels/billing/entitlement-cache';
import { createQuotaService } from '../../../src/channels/billing/quota-service';
import { createQuotaEnforcer } from '../../../src/channels/billing/quota-enforcer';
import { checkBillingHealth } from '../../../src/channels/billing/health/billing-health';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { ENV_KEYS } from '../../../src/config/index';
import type { BillingPort } from '../../../src/ports/billing-port';
import type { Entitlement, Subject } from '../../../src/domain/entitlement';
import { healthy } from '../../../src/domain/health-state';

const subject: Subject = { subjectId: 'user_1', kind: 'user' };

function billingStub(over: Partial<BillingPort>): BillingPort {
  return {
    startCheckout: async () => ({ checkoutId: 'c', url: 'https://polar.sh/c' }),
    resolveEntitlements: async () => [],
    getQuota: async (s, kind) => ({
      subjectId: s.subjectId,
      kind,
      limit: 100,
      remaining: 100,
      resetAt: new Date().toISOString(),
    }),
    emitUsage: async () => {},
    validateLicenseKey: async () => ({ valid: false }),
    health: async () => healthy(),
    ...over,
  };
}

test('entitlement-resolver denies on a resolution error (fail safe)', async () => {
  const resolver = createEntitlementResolver(
    billingStub({
      resolveEntitlements: async () => {
        throw new Error('polar unreachable');
      },
    }),
  );
  assert.deepEqual(await resolver.resolve(subject), []);
  // A pro-only feature is denied when resolution throws and plan is free.
  assert.equal(await resolver.hasFeature(subject, 'custom_domain', 'free'), false);
});

test('entitlement-resolver allows a feature only via plan matrix or explicit grant', async () => {
  // No grants, but the pro plan statically includes publish_site.
  const planResolver = createEntitlementResolver(billingStub({}));
  assert.equal(await planResolver.hasFeature(subject, 'publish_site', 'pro'), true);
  assert.equal(await planResolver.hasFeature(subject, 'publish_site', 'free'), false);

  // Free plan, but an explicit feature_flag grant names the feature.
  const grant: Entitlement = {
    subjectId: 'user_1',
    kind: 'feature_flag',
    key: 'custom_domain',
    plan: 'free',
    granted: true,
  };
  const grantResolver = createEntitlementResolver(
    billingStub({ resolveEntitlements: async () => [grant] }),
  );
  assert.equal(await grantResolver.hasFeature(subject, 'custom_domain', 'free'), true);
});

test('entitlement-cache caches the loader answer and never fabricates grants', async () => {
  let calls = 0;
  const now = { t: 0 };
  const cache = createEntitlementCache({ ttlMs: 1000, now: () => now.t });
  const loader = async (): Promise<Entitlement[]> => {
    calls += 1;
    return [];
  };
  await cache.get(subject, loader);
  await cache.get(subject, loader); // within TTL → cached
  assert.equal(calls, 1);
  now.t = 2000; // past TTL → reload
  await cache.get(subject, loader);
  assert.equal(calls, 2);
});

test('quota-enforcer denies when over quota and on read error', async () => {
  const enforcer = createQuotaEnforcer(
    createQuotaService(
      billingStub({
        getQuota: async (s, kind) => ({
          subjectId: s.subjectId,
          kind,
          limit: 5,
          remaining: 0,
          resetAt: new Date().toISOString(),
        }),
      }),
    ),
  );
  const denied = await enforcer.enforce(subject, 'cli_request');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason ?? '', /quota exceeded/);

  // Read error → fail safe deny.
  const errEnforcer = createQuotaEnforcer(
    createQuotaService(
      billingStub({
        getQuota: async () => {
          throw new Error('meter down');
        },
      }),
    ),
  );
  assert.equal((await errEnforcer.enforce(subject, 'cli_request')).allowed, false);
});

test('quota-enforcer allows an unlimited (limit=0) quota', async () => {
  const enforcer = createQuotaEnforcer(
    createQuotaService(
      billingStub({
        getQuota: async (s, kind) => ({
          subjectId: s.subjectId,
          kind,
          limit: 0,
          remaining: 0,
          resetAt: new Date().toISOString(),
        }),
      }),
    ),
  );
  assert.equal((await enforcer.enforce(subject, 'cli_request')).allowed, true);
});

test('billing-health is truthful: unhealthy without POLAR_ACCESS_TOKEN', async () => {
  const noKey = createEnvSecretPort({});
  const health = await checkBillingHealth(noKey, billingStub({}));
  assert.equal(health.status, 'unhealthy');
  assert.match(health.reason ?? '', /POLAR_ACCESS_TOKEN/);

  const withKey = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_xxx' });
  const ok = await checkBillingHealth(withKey, billingStub({ health: async () => healthy() }));
  assert.equal(ok.status, 'ok');
});
