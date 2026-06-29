import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeviceRegistryService,
  createInMemoryDeviceStore,
} from '../../../src/channels/device-registry/index';
import { resolveDeviceLimit } from '../../../src/channels/billing/plan-capabilities';

const FP = (n: number) => `machine-${n}|darwin|arm64|salt-${n}`;

function makeRegistry() {
  return createDeviceRegistryService({ devices: createInMemoryDeviceStore() });
}

test('plan→device-limit: a free user is capped at 1 device end-to-end', () => {
  const registry = makeRegistry();
  const limit = resolveDeviceLimit('free'); // 1
  const a = registry.register({ userId: 'u', rawFingerprint: FP(1), name: 'A', deviceLimit: limit });
  assert.equal(a.ok, true);
  const b = registry.register({ userId: 'u', rawFingerprint: FP(2), name: 'B', deviceLimit: limit });
  assert.equal(b.ok, false);
  if (!b.ok) {
    assert.equal(b.error.code, 'device_limit_exceeded');
    assert.equal(b.error.detail?.limit, 1);
  }
});

test('plan→device-limit: a team user gets headroom for many devices', () => {
  const registry = makeRegistry();
  const limit = resolveDeviceLimit('team'); // 10
  for (let i = 0; i < limit; i += 1) {
    const r = registry.register({ userId: 'u', rawFingerprint: FP(i), name: `D${i}`, deviceLimit: limit });
    assert.equal(r.ok, true, `device ${i} should register`);
  }
  // The 11th NEW device trips the team cap.
  const over = registry.register({ userId: 'u', rawFingerprint: FP(99), name: 'OVER', deviceLimit: limit });
  assert.equal(over.ok, false);
});

test('plan→device-limit: enterprise (0 = unlimited) never trips the cap', () => {
  const registry = makeRegistry();
  const limit = resolveDeviceLimit('enterprise'); // 0 = unlimited
  // When the resolved limit is 0 the caller treats it as "no cap": pass undefined
  // so the registry does not enforce a finite limit.
  const effective = limit === 0 ? undefined : limit;
  for (let i = 0; i < 25; i += 1) {
    const r = registry.register({
      userId: 'u',
      rawFingerprint: FP(i),
      name: `D${i}`,
      deviceLimit: effective,
    });
    assert.equal(r.ok, true, `enterprise device ${i} should register`);
  }
  assert.equal(registry.list('u').length, 25);
});
