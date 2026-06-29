import type { Result } from '../result';
import type { DistributionError } from '../errors/index';
import type { DeviceRegistration } from '../channels/device-registry/device-registration';

/**
 * The device-registry seam the entitlement/auth gate consumes. It is the
 * narrow, host-replaceable contract for device recognition:
 *
 *  - `register`      — recognize a device for a user/org, enforcing the per-seat
 *                      DEVICE LIMIT (registering past the limit → a typed
 *                      `LIMIT_EXCEEDED` requiring an explicit revoke/approve).
 *  - `list` / `get`  — enumerate / fetch a user's devices.
 *  - `revoke`        — the remote kill-switch; a revoked device id is denied at
 *                      the auth gate.
 *  - `touchLastSeen` — record activity (best-effort).
 *  - `assertRecognized` — the fail-safe gate: an unknown/revoked device denies.
 *
 * Implemented by `createDeviceRegistryService` over an in-memory OR file-backed
 * `DeviceStore`. The gate depends on THIS interface, not the concrete service,
 * so the persistence + limit policy are swappable.
 */
export interface DeviceRegistryPort {
  register(input: {
    userId: string;
    orgId?: string;
    rawFingerprint: string;
    name: string;
    entitlementKey?: string;
    /** Max active devices allowed for this user/seat (the per-seat limit). */
    deviceLimit?: number;
    now?: () => Date;
    deviceId?: () => string;
  }): Result<DeviceRegistration, DistributionError>;

  revoke(input: {
    deviceId: string;
    revokedBy: string;
    now?: () => Date;
  }): Result<DeviceRegistration, DistributionError>;

  get(deviceId: string): DeviceRegistration | undefined;
  list(userId: string): readonly DeviceRegistration[];

  /** Record activity for a device id (best-effort, never throws). */
  touchLastSeen(deviceId: string, now?: () => Date): DeviceRegistration | undefined;

  /**
   * Fail-safe recognition gate. `ok` only when the device exists AND is active;
   * otherwise an `err` explaining the denial (unknown / revoked). The auth gate
   * MUST consult this so an unknown or remotely-revoked device is denied.
   */
  assertRecognized(input: {
    userId: string;
    rawFingerprint: string;
  }): Result<DeviceRegistration, DistributionError>;
}
