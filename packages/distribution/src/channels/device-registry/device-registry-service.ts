import { randomUUID } from 'node:crypto';
import type { Result } from '../../result';
import { ok, err } from '../../result';
import { DistributionError } from '../../errors/index';
import {
  hashFingerprint,
  isDeviceActive,
  type DeviceRegistration,
} from './device-registration';
import type { DeviceStore } from './device-store';

/**
 * The device registry. Register a device under a user/org with a fingerprint,
 * bind it to an entitlement, list a user's/org's devices, and REVOKE a device.
 *
 * The revocation is the load-bearing enterprise control: a revoked device
 * cannot refresh a CLI token (see `assertDeviceCanRefresh`, threaded into
 * `refreshCliToken`). Revocation is local + immediate; it does not depend on
 * the upstream grant changing.
 *
 * Fail safe: an unknown/revoked device is denied, never silently allowed. A
 * blank fingerprint is rejected before any state change.
 */
export interface DeviceRegistryService {
  register(input: {
    userId: string;
    orgId?: string;
    rawFingerprint: string;
    name: string;
    entitlementKey?: string;
    now?: () => Date;
    deviceId?: () => string;
  }): Result<DeviceRegistration, DistributionError>;

  revoke(input: {
    deviceId: string;
    revokedBy: string;
    now?: () => Date;
  }): Result<DeviceRegistration, DistributionError>;

  get(deviceId: string): DeviceRegistration | undefined;
  listByUser(userId: string): readonly DeviceRegistration[];
  listByOrg(orgId: string): readonly DeviceRegistration[];

  /**
   * Mark a device seen (refreshes `lastSeenAt`) — best-effort, no-throw. Returns
   * the updated device or undefined when unknown.
   */
  touch(deviceId: string, now?: () => Date): DeviceRegistration | undefined;

  /**
   * Authoritative refresh gate. Returns `ok` only when the device exists AND is
   * active; otherwise an `err` explaining the denial. A token refresh MUST be
   * gated by this so a revoked device cannot mint a fresh access token.
   */
  assertDeviceCanRefresh(input: {
    userId: string;
    rawFingerprint: string;
  }): Result<DeviceRegistration, DistributionError>;
}

export interface DeviceRegistryServiceDeps {
  readonly devices: DeviceStore;
}

export function createDeviceRegistryService(
  deps: DeviceRegistryServiceDeps,
): DeviceRegistryService {
  function hashOrError(raw: string): string | DistributionError {
    try {
      return hashFingerprint(raw);
    } catch (e) {
      return new DistributionError(
        'invalid_input',
        e instanceof Error ? e.message : 'invalid device fingerprint',
      );
    }
  }

  return {
    register(input) {
      const fingerprintHash = hashOrError(input.rawFingerprint);
      if (fingerprintHash instanceof DistributionError) return err(fingerprintHash);
      if (input.name.trim().length === 0) {
        return err(new DistributionError('invalid_input', 'device name must be non-empty'));
      }

      // Re-registering the same physical device REUSES the record. A revoked
      // device is NOT silently re-activated — that requires an explicit admin
      // action upstream — so a re-register of a revoked device is denied.
      const existing = deps.devices.findByFingerprint(input.userId, fingerprintHash);
      if (existing) {
        if (!isDeviceActive(existing)) {
          return err(
            new DistributionError(
              'entitlement_denied',
              `device '${existing.deviceId}' is revoked and cannot be re-registered`,
              { deviceId: existing.deviceId },
            ),
          );
        }
        return ok(existing);
      }

      const now = (input.now ?? (() => new Date()))();
      const device: DeviceRegistration = {
        deviceId: (input.deviceId ?? (() => `dev_${randomUUID()}`))(),
        userId: input.userId,
        ...(input.orgId ? { orgId: input.orgId } : {}),
        fingerprintHash,
        name: input.name,
        status: 'active',
        ...(input.entitlementKey ? { entitlementKey: input.entitlementKey } : {}),
        registeredAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      };
      deps.devices.put(device);
      return ok(device);
    },

    revoke(input) {
      const device = deps.devices.get(input.deviceId);
      if (!device) {
        return err(
          new DistributionError('invalid_input', `unknown device '${input.deviceId}'`, {
            deviceId: input.deviceId,
          }),
        );
      }
      if (!isDeviceActive(device)) {
        // Idempotent: already revoked → return as-is.
        return ok(device);
      }
      const now = (input.now ?? (() => new Date()))();
      const revoked: DeviceRegistration = {
        ...device,
        status: 'revoked',
        revokedAt: now.toISOString(),
        revokedBy: input.revokedBy,
      };
      deps.devices.put(revoked);
      return ok(revoked);
    },

    get(deviceId) {
      return deps.devices.get(deviceId);
    },
    listByUser(userId) {
      return deps.devices.listByUser(userId);
    },
    listByOrg(orgId) {
      return deps.devices.listByOrg(orgId);
    },

    touch(deviceId, now = () => new Date()) {
      const device = deps.devices.get(deviceId);
      if (!device) return undefined;
      const updated: DeviceRegistration = { ...device, lastSeenAt: now().toISOString() };
      deps.devices.put(updated);
      return updated;
    },

    assertDeviceCanRefresh(input) {
      const fingerprintHash = hashOrError(input.rawFingerprint);
      if (fingerprintHash instanceof DistributionError) return err(fingerprintHash);

      const device = deps.devices.findByFingerprint(input.userId, fingerprintHash);
      if (!device) {
        return err(
          new DistributionError(
            'entitlement_denied',
            'device is not registered (refresh denied — register the device first)',
            { userId: input.userId },
          ),
        );
      }
      if (!isDeviceActive(device)) {
        return err(
          new DistributionError(
            'entitlement_denied',
            `device '${device.deviceId}' is revoked — token refresh denied`,
            { deviceId: device.deviceId },
          ),
        );
      }
      return ok(device);
    },
  };
}
