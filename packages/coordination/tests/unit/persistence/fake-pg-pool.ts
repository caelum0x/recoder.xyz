/**
 * FakePgPool — an in-process implementation of the narrow `PgPool` structural
 * type used by the Postgres adapters. It is NOT a mock of the store: it is a
 * real (if minimal) SQL engine that backs the *exact* statements the adapters
 * emit (the lock upsert, the scope MAX(fence_token) read, the fence-sequence
 * upsert, list/get/delete), enforces the `UNIQUE (space_id, repo, path_glob)`
 * constraint, and implements BEGIN/COMMIT/ROLLBACK with snapshot isolation so
 * the CAS transaction logic is exercised for real.
 *
 * This lets the suite verify the store's compare-and-set behaviour against a
 * pool we own when a live Postgres is unavailable.
 */

import type {
  PgClient,
  PgPool,
  PgQueryResult,
  PgRow,
} from '../../../src/persistence/postgres/pg-pool';
import {
  FENCE_SEQUENCES_TABLE,
  WORK_LOCKS_TABLE,
} from '../../../src/persistence/postgres/schema';

interface LockRow extends PgRow {
  lock_id: string;
  space_id: string;
  repo: string;
  path_glob: string;
  owner_agent_id: string;
  task_id: string;
  acquired_at: string;
  expires_at: string;
  fence_token: number;
  kind: string;
}

interface FenceRow {
  scope_key: string;
  fence_token: number;
}

/** The mutable shared state behind the pool — both tables. */
class Store {
  locks: LockRow[] = [];
  fences: FenceRow[] = [];

  clone(): Store {
    const next = new Store();
    next.locks = this.locks.map((row) => ({ ...row }));
    next.fences = this.fences.map((row) => ({ ...row }));
    return next;
  }
}

function uniqueScopeViolation(rows: LockRow[], candidate: LockRow): boolean {
  return rows.some(
    (row) =>
      row.lock_id !== candidate.lock_id &&
      row.space_id === candidate.space_id &&
      row.repo === candidate.repo &&
      row.path_glob === candidate.path_glob,
  );
}

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Execute one statement against a `Store`. Recognises exactly the statements the
 * adapters emit; anything else throws so a drifting query is caught loudly.
 */
function exec(
  store: Store,
  sql: string,
  values: ReadonlyArray<unknown>,
): PgQueryResult {
  const text = norm(sql);

  if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
    return { rows: [], rowCount: 0 };
  }

  // PostgresLeaseFencer.issue — atomic upsert on the fence sequence.
  if (text.includes(`INSERT INTO ${FENCE_SEQUENCES_TABLE.toUpperCase()}`)) {
    const scopeKey = values[0] as string;
    const existing = store.fences.find((f) => f.scope_key === scopeKey);
    if (existing) {
      existing.fence_token += 1;
      return { rows: [{ fence_token: existing.fence_token }], rowCount: 1 };
    }
    store.fences.push({ scope_key: scopeKey, fence_token: 1 });
    return { rows: [{ fence_token: 1 }], rowCount: 1 };
  }

  // PostgresLeaseFencer.verify — read current high-water token.
  if (
    text.startsWith('SELECT FENCE_TOKEN FROM') &&
    text.includes(FENCE_SEQUENCES_TABLE.toUpperCase())
  ) {
    const scopeKey = values[0] as string;
    const existing = store.fences.find((f) => f.scope_key === scopeKey);
    return existing
      ? { rows: [{ fence_token: existing.fence_token }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // PostgresLockStore.put — CAS read of MAX(fence_token) for the scope.
  if (text.includes('MAX(FENCE_TOKEN) AS MAX_TOKEN')) {
    const [spaceId, repo, pathGlob] = values as [string, string, string];
    const matching = store.locks.filter(
      (l) => l.space_id === spaceId && l.repo === repo && l.path_glob === pathGlob,
    );
    const max =
      matching.length === 0
        ? null
        : matching.reduce((m, l) => Math.max(m, l.fence_token), 0);
    return { rows: [{ max_token: max }], rowCount: 1 };
  }

  // PostgresLockStore.put — the lock upsert.
  if (text.startsWith(`INSERT INTO ${WORK_LOCKS_TABLE.toUpperCase()}`)) {
    const candidate: LockRow = {
      lock_id: values[0] as string,
      space_id: values[1] as string,
      repo: values[2] as string,
      path_glob: values[3] as string,
      owner_agent_id: values[4] as string,
      task_id: values[5] as string,
      acquired_at: values[6] as string,
      expires_at: values[7] as string,
      fence_token: values[8] as number,
      kind: values[9] as string,
    };
    if (uniqueScopeViolation(store.locks, candidate)) {
      const err = new Error(
        `duplicate key value violates unique constraint "${WORK_LOCKS_TABLE}_scope_uniq"`,
      );
      (err as Error & { code?: string }).code = '23505';
      throw err;
    }
    const idx = store.locks.findIndex((l) => l.lock_id === candidate.lock_id);
    if (idx >= 0) {
      store.locks[idx] = candidate;
    } else {
      store.locks.push(candidate);
    }
    return { rows: [{ ...candidate }], rowCount: 1 };
  }

  // PostgresLockStore.list / get
  if (text.startsWith('SELECT LOCK_ID')) {
    if (text.includes('WHERE LOCK_ID =')) {
      const row = store.locks.find((l) => l.lock_id === values[0]);
      return row ? { rows: [{ ...row }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    let rows = store.locks.map((l) => ({ ...l }));
    // Reconstruct the dynamic WHERE from the placeholder order in `list`.
    let valueIdx = 0;
    if (text.includes('SPACE_ID = $')) {
      const spaceId = values[valueIdx++] as string;
      rows = rows.filter((l) => l.space_id === spaceId);
    }
    if (text.includes('REPO = $')) {
      const repo = values[valueIdx++] as string;
      rows = rows.filter((l) => l.repo === repo);
    }
    return { rows, rowCount: rows.length };
  }

  // PostgresLockStore.delete
  if (text.startsWith(`DELETE FROM ${WORK_LOCKS_TABLE.toUpperCase()}`)) {
    const lockId = values[0] as string;
    let valueIdx = 1;
    let ownerAgentId: string | undefined;
    let taskId: string | undefined;
    if (text.includes('OWNER_AGENT_ID = $')) {
      ownerAgentId = values[valueIdx++] as string;
    }
    if (text.includes('TASK_ID = $')) {
      taskId = values[valueIdx++] as string;
    }
    const before = store.locks.length;
    store.locks = store.locks.filter((l) => {
      if (l.lock_id !== lockId) return true;
      if (ownerAgentId !== undefined && l.owner_agent_id !== ownerAgentId) return true;
      if (taskId !== undefined && l.task_id !== taskId) return true;
      return false;
    });
    return { rows: [], rowCount: before - store.locks.length };
  }

  // DDL from bootstrapSchema — accepted as no-ops (tables always exist here).
  if (text.startsWith('CREATE TABLE')) {
    return { rows: [], rowCount: 0 };
  }

  throw new Error(`FakePgPool: unrecognised statement: ${text}`);
}

/**
 * A transaction client: operates on a snapshot of the store and only merges it
 * back on COMMIT, so a thrown CAS error (ROLLBACK) leaves the committed store
 * untouched — the same isolation a real transaction gives.
 */
class FakePgClient implements PgClient {
  private snapshot: Store;
  private committed = false;

  constructor(
    private readonly committedStore: Store,
    private readonly onCommit: (next: Store) => void,
  ) {
    this.snapshot = committedStore.clone();
  }

  async query<R extends PgRow = PgRow>(
    text: string,
    values: ReadonlyArray<unknown> = [],
  ): Promise<PgQueryResult<R>> {
    const upper = norm(text);
    if (upper === 'COMMIT') {
      this.onCommit(this.snapshot);
      this.committed = true;
      return { rows: [], rowCount: 0 } as PgQueryResult<R>;
    }
    if (upper === 'ROLLBACK') {
      return { rows: [], rowCount: 0 } as PgQueryResult<R>;
    }
    return exec(this.snapshot, text, values) as PgQueryResult<R>;
  }

  release(): void {
    // No-op; if not committed, the snapshot is simply discarded.
    void this.committed;
  }
}

export class FakePgPool implements PgPool {
  private store = new Store();

  async query<R extends PgRow = PgRow>(
    text: string,
    values: ReadonlyArray<unknown> = [],
  ): Promise<PgQueryResult<R>> {
    return exec(this.store, text, values) as PgQueryResult<R>;
  }

  async connect(): Promise<PgClient> {
    return new FakePgClient(this.store, (next) => {
      this.store = next;
    });
  }

  /** Test helper: current committed lock row count. */
  lockCount(): number {
    return this.store.locks.length;
  }
}
