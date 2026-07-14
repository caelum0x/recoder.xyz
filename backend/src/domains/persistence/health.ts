/**
 * Truthful persistence health (ARCHITECTURE §10.1). Rules:
 *  - no pool configured            → `down` (never a faked `up`)
 *  - pool present but `SELECT 1` fails → `down` with the reason
 *  - pool saturated (waiting > 0 or idle == 0 at max)  → `degraded`
 *  - otherwise                     → `up` with pool + migration detail
 */
import type { Pool } from 'pg';
import { degraded, healthy, unhealthy, type ComponentHealth } from '../../shared/health-types.js';
import { pingPool, poolStats } from './client/pg-pool.js';
import type { MigrationRunner } from './ports/migration-runner.port.js';

const NAME = 'persistence';

export async function buildPersistenceHealth(
  pool: Pool | null,
  runner: MigrationRunner,
  maxPoolSize: number,
): Promise<ComponentHealth> {
  if (!pool) {
    return unhealthy(NAME, 'no DATABASE_URL configured (in-memory fallback only)', [
      { name: 'postgres', status: 'down', reason: 'unconfigured' },
    ]);
  }

  const alive = await pingPool(pool);
  if (!alive) {
    return unhealthy(NAME, 'database ping failed', [
      { name: 'postgres', status: 'down', reason: 'SELECT 1 failed or timed out' },
    ]);
  }

  const stats = poolStats(pool, maxPoolSize);
  const migration = await runner.status();
  const detail = {
    pool: stats,
    migrations: { applied: migration.applied.length, pending: migration.pending.length },
  };

  // Saturation: every client checked out AND callers are queuing.
  if (stats.waiting > 0 && stats.idle === 0 && stats.total >= stats.max) {
    return degraded(NAME, 'connection pool saturated', [{ name: 'postgres', status: 'up' }]);
  }

  // Pending migrations mean the schema is behind — serving, but flagged.
  if (migration.ok && migration.pending.length > 0) {
    return {
      ...degraded(NAME, `${migration.pending.length} pending migration(s)`, [{ name: 'postgres', status: 'up' }]),
      detail,
    };
  }

  return { ...healthy(NAME, detail), engines: [{ name: 'postgres', status: 'up' }] };
}
