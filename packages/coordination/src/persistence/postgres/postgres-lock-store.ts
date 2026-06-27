/**
 * PostgresLockStore — durable, cross-process `LockStorePort` (production source
 * of record for work-locks). Mirrors `MemoryLockStore` exactly, including the
 * fence-token compare-and-set that `conductor-locks.ts` relies on, but the state
 * lives in Postgres so locks survive a process restart and are visible across
 * conductor processes.
 *
 * `put` is the CAS: inside a single serialized transaction it reads the highest
 * fence token recorded for the lock's (space,repo,pathGlob) scope and rejects a
 * write whose `fenceToken` is below it (`FenceTokenViolationError`), then upserts
 * the row. A second concurrent acquire on the same scope either loses the CAS or
 * trips the `UNIQUE (space_id, repo, path_glob)` constraint — both surface as a
 * fence violation rather than silently double-granting the scope.
 *
 * NULL `repo` is stored as the empty string so it participates in the unique
 * scope constraint and the scope-key comparison the same way the memory adapter
 * treats `repo ?? ''`.
 */

import type { WorkLock } from '../../domain';
import { FenceTokenViolationError } from '../../errors';
import type { LockScope, LockStorePort } from '../../ports';
import { WORK_LOCKS_TABLE } from './schema';
import { withTransaction } from './pg-pool';
import type { PgPool, PgQueryable, PgRow } from './pg-pool';

interface WorkLockRow extends PgRow {
  lock_id: string;
  space_id: string;
  repo: string;
  path_glob: string;
  owner_agent_id: string;
  task_id: string;
  acquired_at: string | Date;
  expires_at: string | Date;
  fence_token: string | number;
  kind: string;
}

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

function rowToLock(row: WorkLockRow): WorkLock {
  const lock: WorkLock = {
    lockId: row.lock_id,
    spaceId: row.space_id,
    pathGlob: row.path_glob,
    ownerAgentId: row.owner_agent_id,
    taskId: row.task_id,
    acquiredAt: toIso(row.acquired_at),
    expiresAt: toIso(row.expires_at),
    fenceToken: toNumber(row.fence_token),
    kind: row.kind === 'shared' ? 'shared' : 'exclusive',
  };
  // The empty-string sentinel means "no repo"; only attach a defined repo.
  if (row.repo !== '') {
    return { ...lock, repo: row.repo };
  }
  return lock;
}

export class PostgresLockStore implements LockStorePort {
  constructor(private readonly pool: PgPool) {}

  async list(scope: LockScope): Promise<WorkLock[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (scope.spaceId !== '*') {
      values.push(scope.spaceId);
      clauses.push(`space_id = $${values.length}`);
    }
    if (scope.repo !== undefined) {
      values.push(scope.repo);
      clauses.push(`repo = $${values.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.pool.query<WorkLockRow>(
      `SELECT lock_id, space_id, repo, path_glob, owner_agent_id, task_id,
              acquired_at, expires_at, fence_token, kind
         FROM ${WORK_LOCKS_TABLE} ${where}`,
      values,
    );
    return result.rows.map(rowToLock);
  }

  async put(lock: WorkLock): Promise<WorkLock> {
    const repo = lock.repo ?? '';
    return withTransaction(this.pool, async (client: PgQueryable) => {
      // CAS: the highest fence token already recorded for this scope. A write
      // below it is a stale writer resuming after re-acquire — reject it.
      const current = await client.query<{ max_token: string | number | null }>(
        `SELECT MAX(fence_token) AS max_token
           FROM ${WORK_LOCKS_TABLE}
          WHERE space_id = $1 AND repo = $2 AND path_glob = $3`,
        [lock.spaceId, repo, lock.pathGlob],
      );
      const maxRaw = current.rows[0]?.max_token;
      const highest = maxRaw === null || maxRaw === undefined ? 0 : toNumber(maxRaw);
      if (lock.fenceToken < highest) {
        throw new FenceTokenViolationError(lock.fenceToken, highest);
      }

      const inserted = await client.query<WorkLockRow>(
        `INSERT INTO ${WORK_LOCKS_TABLE}
           (lock_id, space_id, repo, path_glob, owner_agent_id, task_id,
            acquired_at, expires_at, fence_token, kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (lock_id) DO UPDATE SET
           space_id = EXCLUDED.space_id,
           repo = EXCLUDED.repo,
           path_glob = EXCLUDED.path_glob,
           owner_agent_id = EXCLUDED.owner_agent_id,
           task_id = EXCLUDED.task_id,
           acquired_at = EXCLUDED.acquired_at,
           expires_at = EXCLUDED.expires_at,
           fence_token = EXCLUDED.fence_token,
           kind = EXCLUDED.kind
         RETURNING lock_id, space_id, repo, path_glob, owner_agent_id, task_id,
                   acquired_at, expires_at, fence_token, kind`,
        [
          lock.lockId,
          lock.spaceId,
          repo,
          lock.pathGlob,
          lock.ownerAgentId,
          lock.taskId,
          lock.acquiredAt,
          lock.expiresAt,
          lock.fenceToken,
          lock.kind,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new Error(`Lock put returned no row for ${lock.lockId}`);
      }
      return rowToLock(row);
    });
  }

  async delete(
    lockId: string,
    owner?: { ownerAgentId?: string; taskId?: string },
  ): Promise<void> {
    const clauses = ['lock_id = $1'];
    const values: unknown[] = [lockId];
    if (owner?.ownerAgentId) {
      values.push(owner.ownerAgentId);
      clauses.push(`owner_agent_id = $${values.length}`);
    }
    if (owner?.taskId) {
      values.push(owner.taskId);
      clauses.push(`task_id = $${values.length}`);
    }
    await this.pool.query(
      `DELETE FROM ${WORK_LOCKS_TABLE} WHERE ${clauses.join(' AND ')}`,
      values,
    );
  }

  async get(lockId: string): Promise<WorkLock | undefined> {
    const result = await this.pool.query<WorkLockRow>(
      `SELECT lock_id, space_id, repo, path_glob, owner_agent_id, task_id,
              acquired_at, expires_at, fence_token, kind
         FROM ${WORK_LOCKS_TABLE} WHERE lock_id = $1`,
      [lockId],
    );
    const row = result.rows[0];
    return row ? rowToLock(row) : undefined;
  }
}
