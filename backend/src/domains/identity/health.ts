/**
 * Identity health — truthful `up | down | degraded` across the domain's engines.
 *
 * Rollup drivers: `better-auth` (session/OAuth hosting), `auth-db` (the Better
 * Auth database is configured), and `key-store` (the persistence executor the
 * `sk_`/device/org stores bind to). `internal-key` is reported for visibility
 * but does not lower the rollup (its absence is a valid "no internal callers"
 * posture). Nothing here fakes `up`: a missing secret / unconfigured DB / down
 * pool is reported with a reason.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { BetterAuthAdapter } from './adapters/better-auth.adapter.js';
import type { IdentityConfig } from './config.js';

export interface IdentityHealthDeps {
  readonly adapter: BetterAuthAdapter;
  readonly config: IdentityConfig;
  /** The persistence executor the sk_/device/org stores bind to (optional). */
  readonly executor?: QueryExecutor;
}

/** Roll a set of statuses up: none-up → down, all-up → up, else → degraded. */
function rollup(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return 'unknown';
  const anyUp = statuses.some((s) => s === 'up');
  const allUp = statuses.every((s) => s === 'up');
  if (allUp) return 'up';
  if (!anyUp) return 'down';
  return 'degraded';
}

/** Build the identity component health. */
export function buildIdentityHealth(deps: IdentityHealthDeps): ComponentHealth {
  const { adapter, config, executor } = deps;

  const betterAuth = adapter.engineStatus();

  const authDb: EngineStatus = config.authDatabaseUrl
    ? { name: 'auth-db', status: 'up' }
    : { name: 'auth-db', status: 'down', reason: 'AUTH_DATABASE_URL not configured' };

  const keyStore: EngineStatus = executor
    ? executor.isAvailable()
      ? { name: 'key-store', status: 'up' }
      : { name: 'key-store', status: 'down', reason: 'persistence pool unavailable' }
    : { name: 'key-store', status: 'down', reason: 'persistence executor not injected' };

  const internalKey: EngineStatus = config.internalServiceKeyPresent
    ? { name: 'internal-key', status: 'up' }
    : { name: 'internal-key', status: 'degraded', reason: 'INTERNAL_SERVICE_KEY not configured (no internal access)' };

  const engines: readonly EngineStatus[] = [betterAuth, authDb, keyStore, internalKey];

  // Rollup excludes internal-key (its absence is a valid posture, not impairment).
  const status = rollup([betterAuth.status, authDb.status, keyStore.status]);
  const isDegraded = status === 'degraded';

  const base = {
    name: 'identity',
    status,
    degraded: isDegraded,
    engines,
    detail: {
      strictAuth: config.strictAuth,
      cookieDomain: adapter.cookieDomain(),
    },
  };

  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
