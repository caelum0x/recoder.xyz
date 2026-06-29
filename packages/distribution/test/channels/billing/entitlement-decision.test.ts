import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capabilitiesForPlan,
  deviceLimitForPlan,
  planAllowsFeature,
  resolveDeviceLimit,
} from '../../../src/channels/billing/plan-capabilities';
import { decideEntitlement } from '../../../src/channels/billing/entitlement-decision';
import { createEntitlementResolver } from '../../../src/channels/billing/entitlement-resolver';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { ENV_KEYS } from '../../../src/config/index';
import { PLANS, planSatisfies, planHasFeature } from '../../../src/domain/subscription-plan';
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

const withBilling = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_xxx' });
const noBilling = createEnvSecretPort({});

test('the four tiers exist and order free < pro < team < enterprise', () => {
  assert.deepEqual([...PLANS], ['free', 'pro', 'team', 'enterprise']);
  assert.equal(planSatisfies('team', 'pro'), true);
  assert.equal(planSatisfies('enterprise', 'team'), true);
  assert.equal(planSatisfies('team', 'enterprise'), false);
  assert.equal(planSatisfies('pro', 'team'), false);
});

test('team tier carries pro features plus priority release channel, not desktop builds', () => {
  assert.equal(planHasFeature('team', 'publish_site'), true);
  assert.equal(planHasFeature('team', 'custom_domain'), true);
  assert.equal(planHasFeature('team', 'usage_metering'), true);
  assert.equal(planHasFeature('team', 'priority_release_channel'), true);
  // Enterprise-only bespoke control is NOT in team.
  assert.equal(planHasFeature('team', 'desktop_signed_build'), false);
  assert.equal(planHasFeature('enterprise', 'desktop_signed_build'), true);
});

test('plan capabilities map each tier to a device limit (0 = unlimited)', () => {
  assert.equal(deviceLimitForPlan('free'), 1);
  assert.equal(deviceLimitForPlan('pro'), 3);
  assert.equal(deviceLimitForPlan('team'), 10);
  assert.equal(deviceLimitForPlan('enterprise'), 0);

  const team = capabilitiesForPlan('team');
  assert.equal(team.deviceLimit, 10);
  assert.equal(team.seatBilled, true);
  assert.equal(capabilitiesForPlan('pro').seatBilled, false);
  assert.equal(planAllowsFeature('team', 'priority_release_channel'), true);
});

test('resolveDeviceLimit: explicit override wins over the plan default', () => {
  assert.equal(resolveDeviceLimit('free'), 1); // plan default
  assert.equal(resolveDeviceLimit('free', 5), 5); // override wins
  assert.equal(resolveDeviceLimit('enterprise', 2), 2); // override caps an unlimited tier
});

test('decideEntitlement: free-tier feature is allowed even with billing UNCONFIGURED', async () => {
  const resolver = createEntitlementResolver(billingStub({}));
  // signed_preview is a free-tier feature → no provider needed.
  const d = await decideEntitlement({ resolver, secrets: noBilling }, subject, 'signed_preview', 'free');
  assert.equal(d.allowed, true);
  assert.equal(d.deviceLimit, 1);
});

test('decideEntitlement: paid feature is DENIED when billing is unconfigured (fail safe)', async () => {
  const resolver = createEntitlementResolver(billingStub({}));
  // pro plan statically carries publish_site, but with no provider we deny.
  const d = await decideEntitlement({ resolver, secrets: noBilling }, subject, 'publish_site', 'pro');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'billing_unconfigured');
  assert.match(d.message ?? '', /POLAR_ACCESS_TOKEN/);
});

test('decideEntitlement: plan-matrix feature is allowed when billing IS configured', async () => {
  const resolver = createEntitlementResolver(billingStub({}));
  const d = await decideEntitlement({ resolver, secrets: withBilling }, subject, 'custom_domain', 'team');
  assert.equal(d.allowed, true);
  assert.equal(d.deviceLimit, 10);
});

test('decideEntitlement: a feature the tier never carries → feature_not_in_plan', async () => {
  const resolver = createEntitlementResolver(billingStub({}));
  const d = await decideEntitlement({ resolver, secrets: withBilling }, subject, 'desktop_signed_build', 'team');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'feature_not_in_plan');
});

test('decideEntitlement: an explicit feature_flag grant lifts a tier above its matrix', async () => {
  const grant: Entitlement = {
    subjectId: 'user_1',
    kind: 'feature_flag',
    key: 'desktop_signed_build',
    plan: 'team',
    granted: true,
  };
  const resolver = createEntitlementResolver(
    billingStub({ resolveEntitlements: async () => [grant] }),
  );
  const d = await decideEntitlement({ resolver, secrets: withBilling }, subject, 'desktop_signed_build', 'team');
  assert.equal(d.allowed, true);
});

test('decideEntitlement: resolver error denies (deny on miss), never optimistic allow', async () => {
  const resolver = createEntitlementResolver(
    billingStub({
      resolveEntitlements: async () => {
        throw new Error('polar unreachable');
      },
    }),
  );
  // free plan, paid feature, provider throws → denied.
  const d = await decideEntitlement({ resolver, secrets: withBilling }, subject, 'custom_domain', 'free');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'feature_not_in_plan');
});
