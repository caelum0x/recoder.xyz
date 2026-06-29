import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createDeviceRegistryService,
  createInMemoryDeviceStore,
  createFileDeviceStore,
} from '../../../src/channels/device-registry/index';
import type { RunEvent } from '@recoder/agent-os';
import type { EventBusPort } from '../../../src/ports/event-bus-port';

const FP_A = 'machine-a|darwin|arm64|salt-a';
const FP_B = 'machine-b|linux|x64|salt-b';
const FP_C = 'machine-c|win32|x64|salt-c';

function makeRegistry() {
  const devices = createInMemoryDeviceStore();
  return { registry: createDeviceRegistryService({ devices }), devices };
}

test('per-seat device limit: registering past the limit returns a typed LIMIT_EXCEEDED', () => {
  const { registry } = makeRegistry();
  const limit = 2;

  const r1 = registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A', deviceLimit: limit });
  const r2 = registry.register({ userId: 'u1', rawFingerprint: FP_B, name: 'B', deviceLimit: limit });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);

  // Third NEW device → denied with the typed code + detail for revoke/approve.
  const r3 = registry.register({ userId: 'u1', rawFingerprint: FP_C, name: 'C', deviceLimit: limit });
  assert.equal(r3.ok, false);
  if (!r3.ok) {
    assert.equal(r3.error.code, 'device_limit_exceeded');
    assert.equal(r3.error.detail?.limit, 2);
    assert.equal(r3.error.detail?.activeCount, 2);
    assert.equal((r3.error.detail?.activeDeviceIds as string[]).length, 2);
  }
});

test('re-registering an already-known device never trips the limit', () => {
  const { registry } = makeRegistry();
  registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A', deviceLimit: 1 });
  // Same fingerprint again — recognized, not a new slot.
  const again = registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A', deviceLimit: 1 });
  assert.equal(again.ok, true);
  assert.equal(registry.list('u1').length, 1);
});

test('revoking frees a slot so a new device can register (explicit revoke unblocks)', () => {
  const { registry } = makeRegistry();
  const r1 = registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A', deviceLimit: 1 });
  assert.ok(r1.ok);

  // At the cap → denied.
  assert.equal(
    registry.register({ userId: 'u1', rawFingerprint: FP_B, name: 'B', deviceLimit: 1 }).ok,
    false,
  );

  // Explicit revoke frees the slot.
  registry.revoke({ deviceId: r1.ok ? r1.value.deviceId : '', revokedBy: 'admin' });
  const r2 = registry.register({ userId: 'u1', rawFingerprint: FP_B, name: 'B', deviceLimit: 1 });
  assert.equal(r2.ok, true);
});

test('new-device signal: an event is emitted only on the FIRST registration of an id', async () => {
  const emitted: RunEvent[] = [];
  const events: EventBusPort = {
    async emit(e) {
      emitted.push(e);
    },
  };
  const devices = createInMemoryDeviceStore();
  const registry = createDeviceRegistryService({
    devices,
    events,
    taskId: 'task_1',
    eventId: (() => {
      let n = 0;
      return () => `evt_${++n}`;
    })(),
  });

  registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'Work Laptop' });
  // Re-register the SAME device → no second signal.
  registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'Work Laptop' });
  // A genuinely new device → another signal.
  registry.register({ userId: 'u1', rawFingerprint: FP_B, name: 'Phone' });

  // Allow the fire-and-forget emits to flush.
  await new Promise((r) => setImmediate(r));

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0]?.type, 'log');
  assert.equal(emitted[0]?.data?.signal, 'new_device');
  assert.equal(emitted[0]?.data?.name, 'Work Laptop');
  assert.equal(emitted[0]?.taskId, 'task_1');
  assert.equal(emitted[1]?.data?.name, 'Phone');
  // The raw fingerprint is NEVER in the signal.
  assert.ok(!JSON.stringify(emitted).includes(FP_A));
});

test('touchLastSeen records activity and is an alias of touch', () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A' });
  const id = reg.ok ? reg.value.deviceId : '';
  const before = registry.get(id)?.lastSeenAt;

  const later = () => new Date('2030-01-01T00:00:00Z');
  const touched = registry.touchLastSeen(id, later);
  assert.equal(touched?.lastSeenAt, '2030-01-01T00:00:00.000Z');
  assert.notEqual(touched?.lastSeenAt, before);

  // Unknown id → undefined, never throws.
  assert.equal(registry.touchLastSeen('nope'), undefined);
});

test('assertRecognized: active passes, unknown + revoked deny (fail safe gate)', () => {
  const { registry } = makeRegistry();
  const reg = registry.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A' });

  assert.equal(registry.assertRecognized({ userId: 'u1', rawFingerprint: FP_A }).ok, true);

  const unknown = registry.assertRecognized({ userId: 'u1', rawFingerprint: 'ghost' });
  assert.equal(unknown.ok, false);

  registry.revoke({ deviceId: reg.ok ? reg.value.deviceId : '', revokedBy: 'admin' });
  const revoked = registry.assertRecognized({ userId: 'u1', rawFingerprint: FP_A });
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.match(revoked.error.message, /revoked/);
});

test('file-backed store persists registrations across reloads (durable recognition)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devreg-'));
  const path = join(dir, 'devices.json');
  try {
    // First process: register two devices.
    const reg1 = createDeviceRegistryService({ devices: createFileDeviceStore(path) });
    const a = reg1.register({ userId: 'u1', rawFingerprint: FP_A, name: 'A' });
    reg1.register({ userId: 'u1', rawFingerprint: FP_B, name: 'B' });
    assert.ok(a.ok);

    // The file holds a HASH, never the raw fingerprint.
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes(FP_A));

    // Second process: a fresh store over the SAME file recognizes the devices.
    const reg2 = createDeviceRegistryService({ devices: createFileDeviceStore(path) });
    assert.equal(reg2.list('u1').length, 2);
    assert.equal(reg2.assertRecognized({ userId: 'u1', rawFingerprint: FP_A }).ok, true);

    // A revoke in the second process persists for a third reload.
    reg2.revoke({ deviceId: a.ok ? a.value.deviceId : '', revokedBy: 'admin' });
    const reg3 = createDeviceRegistryService({ devices: createFileDeviceStore(path) });
    assert.equal(reg3.assertRecognized({ userId: 'u1', rawFingerprint: FP_A }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file-backed store degrades to EMPTY (deny) on a corrupt registry file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devreg-corrupt-'));
  const path = join(dir, 'devices.json');
  try {
    // Write garbage, then load: an unreadable store recognizes NO device.
    writeFileSync(path, '{ not valid json at all');
    const reg = createDeviceRegistryService({ devices: createFileDeviceStore(path) });
    assert.equal(reg.list('u1').length, 0);
    assert.equal(reg.assertRecognized({ userId: 'u1', rawFingerprint: FP_A }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
