/**
 * The single shared `pg.Pool`. No other domain constructs a pool — persistence
 * owns the one control-plane connection (ARCHITECTURE §2, law #1).
 *
 * Degrade-safe: with no `databaseUrl` the factory returns `null` (the module
 * reports `down`, callers get a truthful `SERVICE_UNAVAILABLE`), and boot is
 * never blocked. Connection is lazy — the pool connects on first query. A pool
 * `error` event is logged, never crashes the process.
 */
import { Pool, type PoolConfig } from 'pg';
import type { Logger } from '../../../shared/logger.js';
import type { PersistenceConfig } from '../config.js';
import type { PoolStats } from '../types.js';

/**
 * Build the shared pool, or `null` when persistence is unconfigured. SSL is
 * enabled from config with `rejectUnauthorized: false` for managed providers
 * that present an intermediary cert (the connection is still TLS-encrypted).
 */
export function createPgPool(cfg: PersistenceConfig, log: Logger): Pool | null {
  if (!cfg.databaseUrl) {
    log.warn('no DATABASE_URL configured — persistence runs in degraded (in-memory) mode');
    return null;
  }

  const poolConfig: PoolConfig = {
    connectionString: cfg.databaseUrl,
    max: cfg.maxPoolSize,
    min: cfg.minPoolSize,
    // Recycle idle clients so a restarted DB doesn't hand back dead sockets.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(cfg.statementTimeoutMs > 0 ? { statement_timeout: cfg.statementTimeoutMs } : {}),
    ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  const pool = new Pool(poolConfig);
  // A pool-level error (idle client dropped by the server) must never crash the
  // process; log it and let the pool replace the client on the next checkout.
  pool.on('error', (err) => {
    log.error({ err: err.message }, 'idle pg client error (pool will recover)');
  });

  return pool;
}

/** Snapshot live pool counters for health + diagnostics. */
export function poolStats(pool: Pool, max: number): PoolStats {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max,
  };
}

/** Cheap liveness probe: `SELECT 1` bounded by a timeout. */
export async function pingPool(pool: Pool, timeoutMs = 2_000): Promise<boolean> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('ping timeout')), timeoutMs),
  );
  try {
    await Promise.race([pool.query('select 1'), timeout]);
    return true;
  } catch {
    return false;
  }
}

/** Gracefully drain + close the pool. Idempotent and never throws. */
export async function drainPool(pool: Pool | null, log: Logger): Promise<void> {
  if (!pool) return;
  try {
    await pool.end();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'pool drain error (ignored)');
  }
}
