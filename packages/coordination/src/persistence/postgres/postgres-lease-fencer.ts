/**
 * PostgresLeaseFencer — durable, cross-process `LeaseFencerPort`.
 *
 * Issues strictly-increasing monotonic fence tokens per scope key so a stale
 * writer cannot clobber a re-acquired lock — the same contract as
 * `MemoryLeaseFencer`, but the high-water token lives in Postgres
 * (`coordination_fence_sequences`) instead of a process-local Map, so two
 * conductor processes racing to acquire the same scope can never be handed the
 * same token.
 *
 * `issue` is a single atomic upsert: `INSERT ... ON CONFLICT DO UPDATE SET
 * fence_token = sequences.fence_token + 1 RETURNING fence_token`. Postgres
 * serializes concurrent updates to the same row, so each caller gets a distinct,
 * strictly higher token. `verify` reads the current high-water token and accepts
 * any token >= it (a holder of the latest token, or a newer one, is current).
 */

import type { LeaseFencerPort } from '../../ports';
import { FENCE_SEQUENCES_TABLE } from './schema';
import type { PgPool, PgRow } from './pg-pool';

interface FenceTokenRow extends PgRow {
  fence_token: string | number;
}

function toNumber(value: string | number): number {
  // pg returns BIGINT as a string to avoid precision loss; fence tokens stay
  // well within Number.MAX_SAFE_INTEGER, so a checked parse is safe.
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid fence token from Postgres: ${String(value)}`);
  }
  return n;
}

export class PostgresLeaseFencer implements LeaseFencerPort {
  constructor(private readonly pool: PgPool) {}

  async issue(scopeKey: string): Promise<number> {
    const result = await this.pool.query<FenceTokenRow>(
      `INSERT INTO ${FENCE_SEQUENCES_TABLE} (scope_key, fence_token)
         VALUES ($1, 1)
       ON CONFLICT (scope_key)
         DO UPDATE SET fence_token = ${FENCE_SEQUENCES_TABLE}.fence_token + 1
       RETURNING fence_token`,
      [scopeKey],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Fence issue returned no row for scope ${scopeKey}`);
    }
    return toNumber(row.fence_token);
  }

  async verify(scopeKey: string, token: number): Promise<boolean> {
    const result = await this.pool.query<FenceTokenRow>(
      `SELECT fence_token FROM ${FENCE_SEQUENCES_TABLE} WHERE scope_key = $1`,
      [scopeKey],
    );
    const row = result.rows[0];
    const current = row ? toNumber(row.fence_token) : 0;
    return token >= current;
  }
}
