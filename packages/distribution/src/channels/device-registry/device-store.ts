import type { DeviceRegistration } from './device-registration';

/**
 * Persistence port for device registrations. In-memory reference impl below; a
 * host wires a durable repository behind the same interface. Lookups are keyed
 * by `deviceId` and by `(userId, fingerprintHash)` so the same physical device
 * re-registering is recognized rather than duplicated.
 */
export interface DeviceStore {
  put(device: DeviceRegistration): void;
  get(deviceId: string): DeviceRegistration | undefined;
  /** Find an existing registration for a user's fingerprint (any status). */
  findByFingerprint(userId: string, fingerprintHash: string): DeviceRegistration | undefined;
  listByUser(userId: string): readonly DeviceRegistration[];
  listByOrg(orgId: string): readonly DeviceRegistration[];
}

export function createInMemoryDeviceStore(): DeviceStore {
  const byId = new Map<string, DeviceRegistration>();
  const fpKey = (userId: string, fp: string) => `${userId}:${fp}`;
  const byFingerprint = new Map<string, string>();

  return {
    put(device) {
      byId.set(device.deviceId, device);
      byFingerprint.set(fpKey(device.userId, device.fingerprintHash), device.deviceId);
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
