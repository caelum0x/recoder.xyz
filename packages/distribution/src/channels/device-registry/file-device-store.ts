import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { DeviceRegistrationSchema, type DeviceRegistration } from './device-registration';
import type { DeviceStore } from './device-store';

/**
 * The on-disk shape of the device registry file: a flat array of
 * registrations. Validated on load — a corrupt/partial file degrades to an
 * EMPTY registry (fail safe: an unreadable store recognizes NO device, so the
 * gate denies, rather than silently trusting garbage).
 */
const DeviceFileSchema = z.object({
  version: z.literal(1),
  devices: z.array(DeviceRegistrationSchema),
});

function loadFromDisk(path: string): Map<string, DeviceRegistration> {
  const byId = new Map<string, DeviceRegistration>();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // No file yet → empty registry.
    return byId;
  }
  const parsed = DeviceFileSchema.safeParse(JSON.parse(safeJson(raw)));
  if (!parsed.success) {
    // Corrupt store → empty (deny by default), never throw.
    return byId;
  }
  for (const device of parsed.data.devices) {
    byId.set(device.deviceId, device);
  }
  return byId;
}

/** Parse JSON without throwing; a non-object becomes `{}` so Zod can reject it. */
function safeJson(raw: string): string {
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return '{}';
  }
}

/**
 * Atomically persist the registry: write a temp file, then rename over the
 * target. A crash mid-write cannot leave a half-written registry that would
 * fail to load (and silently deny every device).
 */
function persist(path: string, byId: Map<string, DeviceRegistration>): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify(
    { version: 1, devices: [...byId.values()] },
    null,
    2,
  );
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${payload}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * A durable, file-backed {@link DeviceStore}. Loads the registry from a JSON
 * file on construction and writes it back atomically on every mutation. The
 * same interface as `createInMemoryDeviceStore`, so the registry service and
 * the limit/revoke policy work unchanged on either adapter.
 *
 * The file is written `0600` (owner-only) because it records which machines
 * belong to which user — recognition data, even though it holds only a HASH of
 * each fingerprint, never the raw value.
 */
export function createFileDeviceStore(path: string): DeviceStore {
  const byId = loadFromDisk(path);
  const fpKey = (userId: string, fp: string) => `${userId}:${fp}`;
  const byFingerprint = new Map<string, string>();
  for (const device of byId.values()) {
    byFingerprint.set(fpKey(device.userId, device.fingerprintHash), device.deviceId);
  }

  return {
    put(device) {
      byId.set(device.deviceId, device);
      byFingerprint.set(fpKey(device.userId, device.fingerprintHash), device.deviceId);
      persist(path, byId);
    },
    get(deviceId) {
      return byId.get(deviceId);
    },
    findByFingerprint(userId, fingerprintHash) {
      const id = byFingerprint.get(fpKey(userId, fingerprintHash));
      return id ? byId.get(id) : undefined;
    },
    listByUser(userId) {
      return [...byId.values()].filter((d) => d.userId === userId);
    },
    listByOrg(orgId) {
      return [...byId.values()].filter((d) => d.orgId === orgId);
    },
  };
}
