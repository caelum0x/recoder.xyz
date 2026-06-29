import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeviceIdentity,
  computeFingerprint,
  currentDeviceIdentity,
  generateInstallId,
  DeviceIdentitySchema,
} from '../../../src/channels/device-registry/device-identity';

const INPUTS = {
  installId: 'install-secret-abc',
  os: 'darwin',
  arch: 'arm64',
  hostname: 'work-laptop',
} as const;

test('computeFingerprint is stable for the same install + host facts', () => {
  const a = computeFingerprint(INPUTS);
  const b = computeFingerprint({ ...INPUTS });
  assert.equal(a, b); // deterministic
  assert.equal(a.length, 64); // sha256 hex
  assert.notEqual(a, INPUTS.installId); // one-way, not the raw secret
});

test('fingerprint changes when the install secret changes (two installs, same machine differ)', () => {
  const a = computeFingerprint(INPUTS);
  const b = computeFingerprint({ ...INPUTS, installId: 'a-different-install' });
  assert.notEqual(a, b);
});

test('fingerprint changes when host facts change (os/arch/hostname matter)', () => {
  const base = computeFingerprint(INPUTS);
  assert.notEqual(base, computeFingerprint({ ...INPUTS, os: 'linux' }));
  assert.notEqual(base, computeFingerprint({ ...INPUTS, arch: 'x64' }));
  assert.notEqual(base, computeFingerprint({ ...INPUTS, hostname: 'other-box' }));
});

test('computeFingerprint requires a non-empty installId (no public-facts-only id)', () => {
  assert.throws(() => computeFingerprint({ ...INPUTS, installId: '   ' }), /installId is required/);
});

test('buildDeviceIdentity carries os/arch/hostname + a name (defaults to hostname)', () => {
  const id = buildDeviceIdentity(INPUTS);
  assert.equal(id.os, 'darwin');
  assert.equal(id.arch, 'arm64');
  assert.equal(id.hostname, 'work-laptop');
  assert.equal(id.name, 'work-laptop'); // defaulted
  assert.equal(id.fingerprint, computeFingerprint(INPUTS));
  // Schema-valid.
  assert.doesNotThrow(() => DeviceIdentitySchema.parse(id));

  const named = buildDeviceIdentity({ ...INPUTS, name: 'My Mac' });
  assert.equal(named.name, 'My Mac');
});

test('generateInstallId mints distinct, hex secrets', () => {
  const a = generateInstallId();
  const b = generateInstallId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]+$/);
});

test('currentDeviceIdentity resolves THIS machine and is stable for a fixed installId', () => {
  const a = currentDeviceIdentity({ installId: 'fixed-install' });
  const b = currentDeviceIdentity({ installId: 'fixed-install' });
  assert.equal(a.fingerprint, b.fingerprint); // stable per-install
  assert.equal(a.fingerprint.length, 64);
  assert.ok(a.os.length > 0 && a.arch.length > 0 && a.hostname.length > 0);
});
