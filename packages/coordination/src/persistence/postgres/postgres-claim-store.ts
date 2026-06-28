/**
 * PostgresClaimStore — durable, cross-process `ClaimStorePort` (production source
 * of record for task claims). Mirrors `MemoryClaimStore` exactly, including the
 * idempotency-key short-circuit and the recovery-window-aware
 * `ClaimCoordinator.blocksNewClaim` decision, but the state lives in Postgres so
 * claims survive a process restart and are visible across conductor processes.
 *
 * `compareAndSet` is the exactly-once claim. Inside a single serialized
 * transaction it `SELECT ... FOR UPDATE`s the per-task row (`task_id` is the
 * primary key, so this row lock serializes every racing dispatch of the same
 * task), evaluates the existing claim with the SAME pure logic the memory
 * adapter uses, and only then upserts. Two concurrent dispatches therefore yield
 * exactly one winner: the first transaction to take the row lock decides, the
 * second blocks on the lock and then observes the committed winner. A retry that
 * carries the same idempotency key returns the already-stored claim instead of
 * minting a second one.
 *
 * It also implements the coherence loader's `ClaimSnapshotPort` (`listClaims`),
 * exactly like `MemoryClaimStore`, so the reconcile tick can read every claim in
 * a space from the durable store.
 *
 * The adapter depends only on the narrow `PgPool` structural type, so the pure
 * core takes NO hard dependency on the `pg` package: the composition root passes
 * a real `new pg.Pool(...)` via a lazy `import("pg")`, and the unit suite drives
 * the same code against a fake pool it owns.
 */

import type { TaskClaim } from '../../domain';
import { ClaimCoordinator } from '../../dispatch/claim-coordinator';
import type { ClaimStorePort } from '../../ports';
import type { ClaimSnapshotPort } from '../../coherence/snapshot-loader';
import { TASK_CLAIMS_TABLE } from './schema';
import { withTransaction } from './pg-pool';
import type { PgPool, PgQueryable, PgRow } from './pg-pool';

interface TaskClaimRow extends PgRow {
  task_id: string;
  claim_id: string;
  space_id: string;
  agent_id: string;
  run_id: string | null;
  status: string;
  claimed_at: string | Date;
  lease_until: string | Date;
  fence_token: string | number;
  idempotency_key: string;
}

const CLAIM_COLUMNS = `task_id, claim_id, space_id, agent_id, run_id, status,
                       claimed_at, lease_until, fence_token, idempotency_key`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid fence token from Postgres: ${String(value)}`);
  }
  return n;
}

function isClaimStatus(value: string): value is TaskClaim['status'] {
  return value === 'claimed' || value === 'recovering' || value === 'released' || value === 'lost';
}

function rowToClaim(row: TaskClaimRow): TaskClaim {
  const status = isClaimStatus(row.status) ? row.status : 'lost';
  const claim: TaskClaim = {
    claimId: row.claim_id,
    taskId: row.task_id,
    spaceId: row.space_id,
    agentId: row.agent_id,
    status,
    claimedAt: toIso(row.claimed_at),
    leaseUntil: toIso(row.lease_until),
    fenceToken: toNumber(row.fence_token),
    idempotencyKey: row.idempotency_key,
  };
  // runId is optional; only attach a defined value (matches the memory shape).
  if (row.run_id !== null && row.run_id !== undefined) {
    return { ...claim, runId: row.run_id };
  }
  return claim;
}

export type PostgresClaimStoreOptions = {
  /** multica claimResponseRecoveryWindow — protects an in-flight start. */
  recoveryWindowMs: number;
  /** Clock for window/lease evaluation; defaults to wall-clock. */
  now?: () => string;
};

export class PostgresClaimStore implements ClaimStorePort, ClaimSnapshotPort {
  private readonly coordinator = new ClaimCoordinator();
  private readonly recoveryWindowMs: number;
  private readonly now: () => string;

  constructor(
    private readonly pool: PgPool,
    options: PostgresClaimStoreOptions,
  ) {
    this.recoveryWindowMs = options.recoveryWindowMs;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async getByTask(taskId: string): Promise<TaskClaim | undefined> {
    const result = await this.pool.query<TaskClaimRow>(
      `SELECT ${CLAIM_COLUMNS} FROM ${TASK_CLAIMS_TABLE} WHERE task_id = $1`,
      [taskId],
    );
    const row = result.rows[0];
    return row ? rowToClaim(row) : undefined;
  }

  async compareAndSet(claim: TaskClaim): Promise<TaskClaim | undefined> {
    const now = this.now();
    return withTransaction(this.pool, async (client: PgQueryable) => {
      // Take the per-task row lock so racing dispatches of the same task
      // serialize here: the first transaction decides, the rest observe its
      // committed result. `task_id` is the primary key, so at most one row.
      const current = await client.query<TaskClaimRow>(
        `SELECT ${CLAIM_COLUMNS} FROM ${TASK_CLAIMS_TABLE}
          WHERE task_id = $1 FOR UPDATE`,
        [claim.taskId],
      );
      const existingRow = current.rows[0];
      const existing = existingRow ? rowToClaim(existingRow) : undefined;

      // Idempotency: the same logical dispatch never produces a second claim. A
      // retry with the same idempotency key returns the already-stored claim.
      if (existing && existing.idempotencyKey === claim.idempotencyKey) {
        return existing;
      }

      if (existing && this.coordinator.blocksNewClaim(existing, now, this.recoveryWindowMs)) {
        return undefined; // another agent holds a live/protected claim — loser
      }

      const inserted = await client.query<TaskClaimRow>(
        `INSERT INTO ${TASK_CLAIMS_TABLE}
           (task_id, claim_id, space_id, agent_id, run_id, status,
            claimed_at, lease_until, fence_token, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (task_id) DO UPDATE SET
           claim_id = EXCLUDED.claim_id,
           space_id = EXCLUDED.space_id,
           agent_id = EXCLUDED.agent_id,
           run_id = EXCLUDED.run_id,
           status = EXCLUDED.status,
           claimed_at = EXCLUDED.claimed_at,
           lease_until = EXCLUDED.lease_until,
           fence_token = EXCLUDED.fence_token,
           idempotency_key = EXCLUDED.idempotency_key
         RETURNING ${CLAIM_COLUMNS}`,
        [
          claim.taskId,
          claim.claimId,
          claim.spaceId,
          claim.agentId,
          claim.runId ?? null,
          claim.status,
          claim.claimedAt,
          claim.leaseUntil,
          claim.fenceToken,
          claim.idempotencyKey,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new Error(`Claim compareAndSet returned no row for ${claim.taskId}`);
      }
      return rowToClaim(row);
    });
  }

  async renew(
    claimId: string,
    fenceToken: number,
    leaseUntil: string,
  ): Promise<TaskClaim | undefined> {
    // Only the holder of the current fence token may renew — a stale writer's
    // fence no longer matches, so the WHERE clause matches no row.
    const result = await this.pool.query<TaskClaimRow>(
      `UPDATE ${TASK_CLAIMS_TABLE}
          SET lease_until = $3
        WHERE claim_id = $1 AND fence_token = $2
      RETURNING ${CLAIM_COLUMNS}`,
      [claimId, fenceToken, leaseUntil],
    );
    const row = result.rows[0];
    return row ? rowToClaim(row) : undefined;
  }

  async release(claimId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM ${TASK_CLAIMS_TABLE} WHERE claim_id = $1`,
      [claimId],
    );
  }

  /**
   * List all recorded claims, optionally scoped to spaces. Serves the coherence
   * snapshot loader's `ClaimSnapshotPort` (the reconcile-tick read the per-task
   * `ClaimStorePort` cannot serve).
   */
  async listClaims(spaceIds?: string[]): Promise<TaskClaim[]> {
    if (spaceIds && spaceIds.length > 0) {
      const result = await this.pool.query<TaskClaimRow>(
        `SELECT ${CLAIM_COLUMNS} FROM ${TASK_CLAIMS_TABLE}
          WHERE space_id = ANY($1)`,
        [spaceIds],
      );
      return result.rows.map(rowToClaim);
    }
    const result = await this.pool.query<TaskClaimRow>(
      `SELECT ${CLAIM_COLUMNS} FROM ${TASK_CLAIMS_TABLE}`,
      [],
    );
    return result.rows.map(rowToClaim);
  }
}
