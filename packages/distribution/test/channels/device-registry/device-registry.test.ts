import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeviceRegistryService,
  createInMemoryDeviceStore,
  deviceBoundRefresh,
  hashFingerprint,
} from '../../../src/channels/device-registry/index';
import { buildDeviceFlowConfig } from '../../../src/channels/cli-dist/device-flow/device-flow-config';
import type { AuthPort, RecoderUserProfile } from '../../../src/ports/auth-port';
import { DistributionError } from '../../../src/errors/index';

const SIGNING_KEY = 'test-signing-key-please-rotate';
const FP = 'machine-abc|darwin|arm64|salt-xyz';

function profile(plan: RecoderUserProfile['plan'] = 'enterprise'): RecoderUserProfile {
  return { userId: 'user_123', email: 'dev@recoder.xyz', name: 'Dev', plan, hasOwnApiKey: false };
}

function fauxAuth(p: RecoderUserProfile | null = profile()): AuthPort {
  return {
    async verifySession() {
      return null;
    },
    async getUserProfile() {
      return p;
    },
    async verifyCliAccessToken() {
      return p;
    },
  };
}

function makeRegistry() {
  const devices = createInMemoryDeviceStore();
  return { registry: createDeviceRegistryService({ devices }), devices };
}

test('hashFingerprint is one-way, stable, and rejects empty input', () => {
  const h = hashFingerprint(FP);
  assert.equal(h.length, 64);
  assert.equal(hashFingerprint(FP), h); // stable
  assert.notEqual(h, FP); // not the raw value
  assert.throws(() => hashFingerprint('   '), /non-empty/);
});

test('register binds a device under a user/org and is idempotent per fingerprint', () => {
  const { registry } = makeRegistry();
  const r1 = registry.register({
    userId: 'user_123',
    orgId: 'org_1',
    rawFingerprint: FP,
    name: 'Work Laptop',
    entitlementKey: 'seat_1',
  });
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.value.status, 'active');
    assert.equal(r1.value.orgId, 'org_1');
    assert.equal(r1.value.entitlementKey, 'seat_1');
    assert.equal(r1.value.fingerprintHash, hashFingerprint(FP));
  }

  // Same fingerprint re-registers to the SAME device id (no duplicate).
  const r2 = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'Work Laptop' });
  assert.equal(r2.ok, true);
  if (r1.ok && r2.ok) assert.equal(r2.value.deviceId, r1.value.deviceId);
  assert.equal(registry.listByUser('user_123').length, 1);
});

test('register rejects a blank fingerprint and a blank name', () => {
  const { registry } = makeRegistry();
  const f = registry.register({ userId: 'u', rawFingerprint: '  ', name: 'X' });
  assert.equal(f.ok, false);
  if (!f.ok) assert.equal(f.error.code, 'invalid_input');

  const n = registry.register({ userId: 'u', rawFingerprint: FP, name: '  ' });
  assert.equal(n.ok, false);
});

test('revoke is idempotent and lists/get reflect status', () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  assert.ok(reg.ok);
  const id = reg.ok ? reg.value.deviceId : '';

  const rev = registry.revoke({ deviceId: id, revokedBy: 'admin' });
  assert.equal(rev.ok, true);
  if (rev.ok) {
    assert.equal(rev.value.status, 'revoked');
    assert.equal(rev.value.revokedBy, 'admin');
  }
  assert.equal(registry.get(id)?.status, 'revoked');

  // Idempotent revoke.
  assert.equal(registry.revoke({ deviceId: id, revokedBy: 'admin' }).ok, true);

  // Unknown device → deny.
  assert.equal(registry.revoke({ deviceId: 'nope', revokedBy: 'a' }).ok, false);
});

test('a revoked device cannot be re-registered (no silent re-activation)', () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  assert.ok(reg.ok);
  registry.revoke({ deviceId: reg.ok ? reg.value.deviceId : '', revokedBy: 'admin' });

  const reReg = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  assert.equal(reReg.ok, false);
  if (!reReg.ok) {
    assert.equal(reReg.error.code, 'entitlement_denied');
    assert.match(reReg.error.message, /revoked/);
  }
});

test('assertDeviceCanRefresh: active passes, revoked/unknown deny', () => {
  const { registry } = makeRegistry();
  registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });

  assert.equal(registry.assertDeviceCanRefresh({ userId: 'user_123', rawFingerprint: FP }).ok, true);

  // Unknown fingerprint → deny.
  const unknown = registry.assertDeviceCanRefresh({ userId: 'user_123', rawFingerprint: 'other' });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error.message, /not registered/);
});

test('deviceBoundRefresh mints a token for an active device (recoder.xyz is still the authority)', async () => {
  const { registry } = makeRegistry();
  registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  const config = buildDeviceFlowConfig({ recoderBaseUrl: 'https://recoder.xyz' });

  const token = await deviceBoundRefresh(
    config,
    fauxAuth(profile('pro')),
    registry,
    { refreshToken: 'r', userId: 'user_123', rawFingerprint: FP },
    SIGNING_KEY,
  );
  assert.equal(token.userId, 'user_123');
  assert.equal(token.plan, 'pro');
});

test('deviceBoundRefresh: a REVOKED device cannot refresh (kill-switch, no token minted)', async () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  registry.revoke({ deviceId: reg.ok ? reg.value.deviceId : '', revokedBy: 'admin' });
  const config = buildDeviceFlowConfig({ recoderBaseUrl: 'https://recoder.xyz' });

  await assert.rejects(
    () =>
      deviceBoundRefresh(
        config,
        fauxAuth(profile()),
        registry,
        { refreshToken: 'r', userId: 'user_123', rawFingerprint: FP },
        SIGNING_KEY,
      ),
    (e) => e instanceof DistributionError && e.code === 'entitlement_denied' && /revoked/.test(e.message),
  );
});

test('deviceBoundRefresh denies BEFORE recoder.xyz when the device is revoked', async () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'user_123', rawFingerprint: FP, name: 'L' });
  registry.revoke({ deviceId: reg.ok ? reg.value.deviceId : '', revokedBy: 'admin' });
  const config = buildDeviceFlowConfig({ recoderBaseUrl: 'https://recoder.xyz' });

  let authCalled = false;
  const spyAuth: AuthPort = {
    async verifySession() {
      return null;
    },
    async getUserProfile() {
      authCalled = true;
      return profile();
    },
    async verifyCliAccessToken() {
      return profile();
    },
  };

  await assert.rejects(() =>
    deviceBoundRefresh(
      config,
      spyAuth,
      registry,
      { refreshToken: 'r', userId: 'user_123', rawFingerprint: FP },
      SIGNING_KEY,
    ),
  );
  assert.equal(authCalled, false); // never reached recoder.xyz
});
