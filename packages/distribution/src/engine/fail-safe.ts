import type { SecretPort } from '../ports/secret-port';
import type { ChannelHealth } from '../domain/health-state';
import { unhealthy } from '../domain/health-state';
import { FailSafeError } from '../errors/index';

/**
 * Centralizes the "degrade safely when keys/deps are missing" rule. Given a set
 * of required env keys, returns the missing ones; a present-check that fails
 * yields an `unhealthy` ChannelHealth with a reason (environment evidence),
 * never a green-washed "ok".
 */
export function missingKeys(secrets: SecretPort, requiredKeys: readonly string[]): string[] {
  return requiredKeys.filter((k) => !secrets.has(k));
}

/**
 * Assert every required key is present, or throw a `FailSafeError` naming the
 * missing ones. Use at the top of a publish step that cannot proceed safely.
 */
export function requireKeys(secrets: SecretPort, requiredKeys: readonly string[]): void {
  const missing = missingKeys(secrets, requiredKeys);
  if (missing.length > 0) {
    throw new FailSafeError(`required keys missing: ${missing.join(', ')}`, { missing });
  }
}

/**
 * Build the truthful health for a channel given its required keys. `ok` only
 * when every key is present; otherwise `unhealthy` with the missing set.
 */
export function keyHealth(
  secrets: SecretPort,
  requiredKeys: readonly string[],
  detail?: Record<string, unknown>,
): ChannelHealth | null {
  const missing = missingKeys(secrets, requiredKeys);
  if (missing.length === 0) return null; // caller does its own deeper probe
  return unhealthy(`missing keys: ${missing.join(', ')}`, { ...(detail ?? {}), missing });
}
