import { createHash, randomBytes } from 'node:crypto';
import { arch, hostname, platform } from 'node:os';
import { z } from 'zod';

/**
 * A device identity: the stable, per-install fingerprint a CLI computes once
 * and reuses, plus the human-readable facts (os/arch/hostname/name) that let a
 * user recognize the device in the registry UI.
 *
 * `installId` is a per-install random secret (32 bytes hex) persisted by the
 * host alongside the auth store. It is the entropy that makes the fingerprint
 * stable for THIS install yet unguessable from public host facts — two installs
 * on the same machine get distinct fingerprints, and the fingerprint cannot be
 * reconstructed from os/arch/hostname alone.
 *
 * The `fingerprint` itself is the SHA-256 of `installId | platform | arch |
 * hostname`. It is deterministic: same inputs → same fingerprint, every time.
 */
export interface DeviceIdentity {
  /** Stable per-install fingerprint (SHA-256 hex of the identity inputs). */
  readonly fingerprint: string;
  /** Human-facing device name (defaults to the hostname). */
  readonly name: string;
  readonly os: string;
  readonly arch: string;
  readonly hostname: string;
  /** The per-install secret the fingerprint is derived from. */
  readonly installId: string;
}

export const DeviceIdentitySchema: z.ZodType<DeviceIdentity> = z.object({
  fingerprint: z.string().length(64),
  name: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().min(1),
  hostname: z.string().min(1),
  installId: z.string().min(1),
});

/** The raw inputs a fingerprint is computed from. Host-injectable for tests. */
export interface DeviceIdentityInputs {
  readonly installId: string;
  readonly os: string;
  readonly arch: string;
  readonly hostname: string;
  /** Optional human label; defaults to the hostname. */
  readonly name?: string;
}

/**
 * Compute the stable fingerprint from identity inputs. Deterministic and
 * one-way: the same inputs always yield the same 64-char hex digest. The
 * `installId` is required — without it (an empty install secret) we refuse,
 * because a fingerprint over only-public facts would collide across installs.
 */
export function computeFingerprint(inputs: {
  installId: string;
  os: string;
  arch: string;
  hostname: string;
}): string {
  const installId = inputs.installId.trim();
  if (installId.length === 0) {
    throw new Error('installId is required to compute a stable device fingerprint');
  }
  const material = [installId, inputs.os, inputs.arch, inputs.hostname].join('|');
  return createHash('sha256').update(material).digest('hex');
}

/** Mint a fresh per-install secret (call once per install, then persist it). */
export function generateInstallId(rng: () => Buffer = () => randomBytes(32)): string {
  return rng().toString('hex');
}

/**
 * Build a full {@link DeviceIdentity} from inputs (pure — no env reads). Used
 * by both the live `currentDeviceIdentity` and tests, which inject fixed inputs
 * for determinism.
 */
export function buildDeviceIdentity(inputs: DeviceIdentityInputs): DeviceIdentity {
  const name = (inputs.name ?? inputs.hostname).trim();
  if (name.length === 0) {
    throw new Error('device name must be non-empty');
  }
  return {
    fingerprint: computeFingerprint(inputs),
    name,
    os: inputs.os,
    arch: inputs.arch,
    hostname: inputs.hostname,
    installId: inputs.installId,
  };
}

/**
 * Resolve THIS machine's device identity from the OS (`node:os`), using a
 * caller-provided `installId` (read from the persisted install secret). Host
 * facts come from `os.platform()/arch()/hostname()`; only the `installId` and
 * an optional `name` are injected.
 */
export function currentDeviceIdentity(opts: {
  installId: string;
  name?: string;
}): DeviceIdentity {
  return buildDeviceIdentity({
    installId: opts.installId,
    os: platform(),
    arch: arch(),
    hostname: hostname(),
    ...(opts.name !== undefined ? { name: opts.name } : {}),
  });
}
