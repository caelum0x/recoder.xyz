/**
 * The `/internal/*` `INTERNAL_SERVICE_KEY` gate — a THIN adapter over the interop
 * domain's `internalServiceGuard` (conflict #10: exactly ONE internal-key gate in
 * the codebase). The edge does NOT re-implement the constant-time compare or the
 * header/Bearer extraction; it consumes the interop middleware and only supplies
 * the key from the injected {@link EdgeConfig}.
 *
 * `assertInternalKeyStrength` is the boot-time fail-fast the legacy `server.ts`
 * did inline: in production a present key MUST be ≥32 chars and not a dev/
 * placeholder default. It throws at construction (never at request time) so a
 * misconfigured internal gate fails the boot rather than silently weakening.
 */
import type { RequestHandler } from 'express';
import {
  internalServiceGuard,
  type InternalKeyGateConfig,
} from '../../domains/interop/middleware/internal-key.middleware.js';

/** Placeholder values that must never be accepted as a real key in production. */
const PLACEHOLDER_KEYS = new Set([
  'change-me',
  'changeme',
  'dev',
  'development',
  'placeholder',
  'internal-service-key',
  'test',
]);

export interface InternalKeyGateOptions {
  /** The expected internal-service key; `null`/empty ⇒ gate denies (fail-closed). */
  readonly internalServiceKey: string | null;
}

/**
 * Build the `/internal/*` guard (delegates to the single interop impl). Mount on
 * every `/internal/*` mount in addition to the interop chain.
 */
export function internalKeyGate(options: InternalKeyGateOptions): RequestHandler {
  const config: InternalKeyGateConfig = { internalServiceKey: options.internalServiceKey };
  return internalServiceGuard(config);
}

/**
 * Boot-time strength check. Throws in production when a present key is too short
 * or a known placeholder. A NULL key is allowed here (the gate itself fails
 * closed with 503) so a dev/test boot without the key still starts.
 */
export function assertInternalKeyStrength(key: string | null, isProduction: boolean): void {
  if (!isProduction || key === null || key.length === 0) return;
  if (key.length < 32) {
    throw new Error('INTERNAL_SERVICE_KEY must be at least 32 characters in production.');
  }
  if (PLACEHOLDER_KEYS.has(key.toLowerCase())) {
    throw new Error('INTERNAL_SERVICE_KEY must not be a placeholder/default value in production.');
  }
}

export type { InternalKeyGateConfig };
