import type { DeviceAuthGrant, DeviceGrantStatus } from '../../../domain/device-grant';
import { isGrantExpired } from '../../../domain/device-grant';

/**
 * Server-side store of pending device grants. The `user_code` is single-use:
 * once a browser approves it, it cannot be reused. Expired grants are pruned
 * lazily on read. This in-memory implementation is the reference; a host wires
 * a durable repository behind the same interface.
 */
export interface DeviceGrantStore {
  put(grant: DeviceAuthGrant): void;
  getByDeviceCode(deviceCode: string): DeviceAuthGrant | undefined;
  getByUserCode(userCode: string): DeviceAuthGrant | undefined;
  /** Apply a status transition; returns the updated grant or undefined. */
  transition(
    deviceCode: string,
    status: DeviceGrantStatus,
    patch?: Partial<Pick<DeviceAuthGrant, 'approvedUserId'>>,
  ): DeviceAuthGrant | undefined;
  delete(deviceCode: string): void;
}

export function createInMemoryDeviceGrantStore(
  clock: () => Date = () => new Date(),
): DeviceGrantStore {
  const byDevice = new Map<string, DeviceAuthGrant>();
  const userToDevice = new Map<string, string>();

  function prune(grant: DeviceAuthGrant | undefined): DeviceAuthGrant | undefined {
    if (!grant) return undefined;
    if (grant.status !== 'expired' && isGrantExpired(grant, clock())) {
      const expired: DeviceAuthGrant = { ...grant, status: 'expired' };
      byDevice.set(grant.deviceCode, expired);
      return expired;
    }
    return grant;
  }

  return {
    put(grant) {
      byDevice.set(grant.deviceCode, grant);
      userToDevice.set(grant.userCode, grant.deviceCode);
    },
    getByDeviceCode(deviceCode) {
      return prune(byDevice.get(deviceCode));
    },
    getByUserCode(userCode) {
      const deviceCode = userToDevice.get(userCode);
      if (!deviceCode) return undefined;
      return prune(byDevice.get(deviceCode));
    },
    transition(deviceCode, status, patch) {
      const current = byDevice.get(deviceCode);
      if (!current) return undefined;
      const next: DeviceAuthGrant = { ...current, status, ...(patch ?? {}) };
      byDevice.set(deviceCode, next);
      return next;
    },
    delete(deviceCode) {
      const current = byDevice.get(deviceCode);
      if (current) userToDevice.delete(current.userCode);
      byDevice.delete(deviceCode);
    },
  };
}
