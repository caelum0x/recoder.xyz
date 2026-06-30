import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideCapability,
  capabilityAllowed,
} from '../../../src/channels/billing/capability-gate';
import {
  capabilityLimitForPlan,
  UNLIMITED,
} from '../../../src/channels/billing/plan-capabilities';
import { createEntitlementResolver } from '../../../src/channels/billing/entitlement-resolver';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { ENV_KEYS } from '../../../src/config/index';
import type { BillingPort } from '../../../src/ports/billing-port';
import type { Subject } from '../../../src/domain/entitlement';
import { healthy } from '../../../src/domain/health-state';

const subject: Subject = { subjectId: 'user_1', kind: 'user' };

function billingStub(): BillingPort {
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
  };
}

const resolver = createEntitlementResolver(billingStub());
const withBilling = createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_xxx' });
const noBilling = createEnvSecretPort({});

test('capabilityLimitForPlan: tiers scale parallel agents free<pro<team<enterprise', () => {
  assert.equal(capabilityLimitForPlan('free', 'parallel_agents'), 1);
  assert.equal(capabilityLimitForPlan('pro', 'parallel_agents'), 3);
  assert.equal(capabilityLimitForPlan('team', 'parallel_agents'), 10);
  assert.equal(capabilityLimitForPlan('enterprise', 'parallel_agents'), UNLIMITED);
});

test('capabilityLimitForPlan: remote substrate is paid-only, team seats team+', () => {
  assert.equal(capabilityLimitForPlan('free', 'remote_substrate'), 0);
  assert.equal(capabilityLimitForPlan('pro', 'remote_substrate'), 1);
  assert.equal(capabilityLimitForPlan('free', 'team_seats'), 0);
  assert.equal(capabilityLimitForPlan('pro', 'team_seats'), 0);
  assert.equal(capabilityLimitForPlan('team', 'team_seats'), 25);
  assert.equal(capabilityLimitForPlan('enterprise', 'team_seats'), UNLIMITED);
});

test('decideCapability: free tier allows 1 parallel agent, denies 2 (over_tier_limit)', async () => {
  const ok = await decideCapability({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'free', 1);
  assert.equal(ok.allowed, true);
  assert.equal(ok.limit, 1);

  const over = await decideCapability({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'free', 2);
  assert.equal(over.allowed, false);
  assert.equal(over.reason, 'over_tier_limit');
});

test('decideCapability: pro tier allows up to 3 parallel agents', async () => {
  const d = await decideCapability({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'pro', 3);
  assert.equal(d.allowed, true);
  const over = await decideCapability({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'pro', 4);
  assert.equal(over.allowed, false);
  assert.equal(over.reason, 'over_tier_limit');
});

test('decideCapability: enterprise UNLIMITED parallel agents always allows', async () => {
  const d = await decideCapability({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'enterprise', 9999);
  assert.equal(d.allowed, true);
  assert.equal(d.limit, UNLIMITED);
});

test('decideCapability: remote substrate denied on free (capability_not_in_plan)', async () => {
  const d = await decideCapability({ resolver, secrets: withBilling }, subject, 'remote_substrate', 'free', 1);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'capability_not_in_plan');
});

test('decideCapability: team seats allowed on team, denied on pro', async () => {
  const team = await decideCapability({ resolver, secrets: withBilling }, subject, 'team_seats', 'team', 25);
  assert.equal(team.allowed, true);
  const overTeam = await decideCapability({ resolver, secrets: withBilling }, subject, 'team_seats', 'team', 26);
  assert.equal(overTeam.allowed, false);
  assert.equal(overTeam.reason, 'over_tier_limit');
  const pro = await decideCapability({ resolver, secrets: withBilling }, subject, 'team_seats', 'pro', 1);
  assert.equal(pro.allowed, false);
  assert.equal(pro.reason, 'capability_not_in_plan');
});

test('FAIL SAFE: paid parallel-agent capacity is clamped to free when billing unconfigured', async () => {
  // pro normally gets 3, but with no provider we must not hand out paid capacity.
  const d = await decideCapability({ resolver, secrets: noBilling }, subject, 'parallel_agents', 'pro', 2);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'billing_unconfigured');
  assert.equal(d.limit, 1); // clamped to the free floor
  assert.match(d.message ?? '', /POLAR_ACCESS_TOKEN/);
});

test('FAIL SAFE: free-floor request still works when billing unconfigured', async () => {
  // 1 parallel agent is the free floor — allowed even with no provider.
  const d = await decideCapability({ resolver, secrets: noBilling }, subject, 'parallel_agents', 'team', 1);
  assert.equal(d.allowed, true);
  assert.equal(d.limit, 1);
});

test('FAIL SAFE: remote substrate denied when billing unconfigured (billing_unconfigured)', async () => {
  const d = await decideCapability({ resolver, secrets: noBilling }, subject, 'remote_substrate', 'pro', 1);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'billing_unconfigured');
  assert.equal(d.limit, 0);
});

test('capabilityAllowed: boolean convenience mirrors decideCapability', async () => {
  assert.equal(await capabilityAllowed({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'team', 5), true);
  assert.equal(await capabilityAllowed({ resolver, secrets: withBilling }, subject, 'parallel_agents', 'free', 5), false);
  assert.equal(await capabilityAllowed({ resolver, secrets: noBilling }, subject, 'remote_substrate', 'team', 1), false);
});
