import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * The lifecycle of a registered device. `active` devices may refresh CLI
 * tokens; `revoked` devices are hard-stopped at the next refresh (and retained
 * for audit). Revocation is the enterprise kill-switch for a lost/compromised
 * machine.
 */
export type DeviceStatus = 'active' | 'revoked';

export const DeviceStatusSchema = z.enum(['active', 'revoked']);

/**
 * A device registered under a recoder.xyz user (and optionally an org). The
 * `fingerprint` is an opaque, stable identifier the CLI computes from its host
 * (machine id + os + arch + a per-install salt). We store a SHA-256 HASH of the
 * fingerprint, never the raw value, so the registry can match a device without
 * holding a reversible host identifier.
 *
 * `entitlementKey` binds the device to a specific entitlement/benefit (e.g. a
 * seat or a license-key benefit id); revoking the device revokes that binding's
 * ability to mint fresh tokens, independent of the upstream grant.
 */
export interface DeviceRegistration {
  readonly deviceId: string;
  readonly userId: string;
  readonly orgId?: string;
  /** SHA-256 hex of the raw device fingerprint (never the raw value). */
  readonly fingerprintHash: string;
  readonly name: string;
  readonly status: DeviceStatus;
  /** The entitlement/benefit this device is bound to (seat id, license id, …). */
  readonly entitlementKey?: string;
  readonly registeredAt: string;
  readonly lastSeenAt?: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
}

export const DeviceRegistrationSchema: z.ZodType<DeviceRegistration> = z.object({
  deviceId: z.string().min(1),
  userId: z.string().min(1),
  orgId: z.string().optional(),
  fingerprintHash: z.string().length(64),
  name: z.string().min(1),
  status: DeviceStatusSchema,
  entitlementKey: z.string().optional(),
  registeredAt: z.string().min(1),
  lastSeenAt: z.string().optional(),
  revokedAt: z.string().optional(),
  revokedBy: z.string().optional(),
});

/**
 * Hash a raw device fingerprint. Stable + one-way (SHA-256). The same raw
 * fingerprint always maps to the same hash, so the registry can deduplicate a
 * device without storing the reversible host identifier.
 */
export function hashFingerprint(rawFingerprint: string): string {
  const trimmed = rawFingerprint.trim();
  if (trimmed.length === 0) {
    throw new Error('device fingerprint must be non-empty');
  }
  return createHash('sha256').update(trimmed).digest('hex');
}

/** True when the device may still mint/refresh tokens. */
export function isDeviceActive(device: DeviceRegistration): boolean {
  return device.status === 'active';
}
