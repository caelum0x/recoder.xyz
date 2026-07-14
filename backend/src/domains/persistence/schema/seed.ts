/**
 * `seed.ts` — an idempotent seed loader for dev/test fixtures. No-op in
 * production unless `PERSISTENCE_ALLOW_SEED` (config `allowSeed`) is set. Seeds
 * upsert so a re-run is harmless.
 *
 * Phase 1 ships the loader + a minimal built-in fixture set (a KV marker so a
 * fresh dev DB is provably reachable). Domains register their own fixtures by
 * passing them to `runSeeds`.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../ports/query-executor.port.js';
import type { PersistenceConfig } from '../config.js';

export interface SeedReport {
  readonly ran: boolean;
  readonly applied: number;
  readonly reason?: string;
}

/** A single idempotent seed step. */
export type SeedStep = (executor: QueryExecutor) => Promise<void>;

const BUILTIN_SEEDS: readonly SeedStep[] = [
  async (executor) => {
    await executor.mutate(
      `insert into core.kv_store (namespace, key, value)
       values ('seed', 'marker', :value::jsonb)
       on conflict (namespace, key) do update set value = excluded.value, updated_at = now()`,
      { value: JSON.stringify({ seededAt: new Date().toISOString() }) },
    );
  },
];

/**
 * Run the built-in + provided seed steps. Degrade-safe: refuses to run in
 * production (unless allowed) and swallows/reports per-step errors without
 * throwing into boot.
 */
export async function runSeeds(
  executor: QueryExecutor,
  cfg: PersistenceConfig,
  log: Logger,
  extra: readonly SeedStep[] = [],
): Promise<SeedReport> {
  if (cfg.isProduction && !cfg.allowSeed) {
    return { ran: false, applied: 0, reason: 'seeding disabled in production' };
  }
  if (!executor.isAvailable()) {
    return { ran: false, applied: 0, reason: 'no database' };
  }
  const steps = [...BUILTIN_SEEDS, ...extra];
  let applied = 0;
  for (const step of steps) {
    try {
      await step(executor);
      applied++;
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'seed step failed (continuing)');
    }
  }
  log.info({ applied, total: steps.length }, 'seeds applied');
  return { ran: true, applied };
}
