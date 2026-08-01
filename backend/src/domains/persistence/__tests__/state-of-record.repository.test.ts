import { describe, it, expect } from 'vitest';
import { StateOfRecordRepository } from '../repositories/state-of-record.repository.js';
import type { QueryExecutor, QueryParams } from '../ports/query-executor.port.js';
import type { QueryRow } from '../types.js';

interface Call {
  readonly kind: 'mutate' | 'one' | 'read' | 'execute';
  readonly sql: string;
  readonly params: QueryParams;
}

/**
 * A recording fake executor. `withTransaction` runs the callback against the
 * same executor (flat) so we can assert that appendEvent's writes all happen
 * inside one transaction. `oneRow`/`readRows` are configurable responses.
 */
class FakeExecutor implements QueryExecutor {
  readonly calls: Call[] = [];
  txDepth = 0;
  maxTxDepthDuringAppend = 0;
  private oneRow: QueryRow | null = null;
  private readRows: QueryRow[] = [];
  failOnSnapshotInsert = false;

  setOne(row: QueryRow | null): void {
    this.oneRow = row;
  }
  setRead(rows: QueryRow[]): void {
    this.readRows = rows;
  }

  async execute<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    this.calls.push({ kind: 'execute', sql, params });
    return this.readRows as unknown as T[];
  }
  async read<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    this.calls.push({ kind: 'read', sql, params });
    return this.readRows as unknown as T[];
  }
  async one<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<T | null> {
    this.calls.push({ kind: 'one', sql, params });
    return this.oneRow as T | null;
  }
  async mutate(sql: string, params: QueryParams = {}): Promise<number> {
    this.calls.push({ kind: 'mutate', sql, params });
    if (this.failOnSnapshotInsert && /state_snapshots/.test(sql)) {
      throw new Error('snapshot insert failed');
    }
    return 1;
  }
  async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    this.txDepth += 1;
    this.maxTxDepthDuringAppend = Math.max(this.maxTxDepthDuringAppend, this.txDepth);
    try {
      return await fn(this);
    } finally {
      this.txDepth -= 1;
    }
  }
  isAvailable(): boolean {
    return true;
  }
}

describe('StateOfRecordRepository.appendEvent — atomic, monotonic versioning', () => {
  it('starts at version 1 when the aggregate has no prior snapshot', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 0 }); // coalesce(max(version),0)
    const repo = new StateOfRecordRepository(ex);
    const version = await repo.appendEvent({
      aggregate: 'run',
      aggregateId: 'r1',
      eventType: 'created',
      payload: { a: 1 },
      userId: 'u1',
      snapshot: { status: 'open' },
    });
    expect(version).toBe(1);
  });

  it('advances to max(version)+1 for an existing aggregate', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 3 });
    const repo = new StateOfRecordRepository(ex);
    const version = await repo.appendEvent({
      aggregate: 'run',
      aggregateId: 'r1',
      eventType: 'updated',
      payload: { b: 2 },
      userId: 'u1',
      snapshot: { status: 'merged' },
    });
    expect(version).toBe(4);
  });

  it('performs the event insert, version read, and snapshot insert all inside one transaction', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 0 });
    const repo = new StateOfRecordRepository(ex);
    await repo.appendEvent({
      aggregate: 'task',
      aggregateId: 't1',
      eventType: 'created',
      payload: {},
      userId: 'u1',
      snapshot: {},
    });
    // Exactly one transaction wrapped everything.
    expect(ex.maxTxDepthDuringAppend).toBe(1);
    const kinds = ex.calls.map((c) => c.kind);
    expect(kinds).toEqual(['mutate', 'one', 'mutate']);
    expect(ex.calls[0].sql).toContain('state_events');
    expect(ex.calls[1].sql).toContain('max(version)');
    expect(ex.calls[2].sql).toContain('state_snapshots');
    // The snapshot is written at the newly computed version.
    expect(ex.calls[2].params.version).toBe(1);
  });

  it('serializes event payload and snapshot as JSON strings and defaults actor to null', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 0 });
    const repo = new StateOfRecordRepository(ex);
    await repo.appendEvent({
      aggregate: 'run',
      aggregateId: 'r9',
      eventType: 'noted',
      payload: { hello: 'world' },
      userId: 'owner-1',
      snapshot: { count: 5 },
    });
    const eventInsert = ex.calls[0];
    const snapshotInsert = ex.calls[2];
    expect(eventInsert.params.payload).toBe(JSON.stringify({ hello: 'world' }));
    expect(eventInsert.params.actor_id).toBeNull();
    expect(snapshotInsert.params.payload).toBe(JSON.stringify({ count: 5 }));
    expect(snapshotInsert.params.user_id).toBe('owner-1');
  });

  it('passes an explicit actorId through when provided', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 0 });
    const repo = new StateOfRecordRepository(ex);
    await repo.appendEvent({
      aggregate: 'run',
      aggregateId: 'r1',
      eventType: 'x',
      actorId: 'agent-7',
      payload: null,
      userId: 'u1',
      snapshot: null,
    });
    expect(ex.calls[0].params.actor_id).toBe('agent-7');
    // A null payload is still serialized truthfully, not dropped.
    expect(ex.calls[0].params.payload).toBe(JSON.stringify(null));
  });

  it('propagates a failure from within the transaction (no version returned on partial write)', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ version: 2 });
    ex.failOnSnapshotInsert = true;
    const repo = new StateOfRecordRepository(ex);
    await expect(
      repo.appendEvent({
        aggregate: 'run',
        aggregateId: 'r1',
        eventType: 'x',
        payload: {},
        userId: 'u1',
        snapshot: {},
      }),
    ).rejects.toThrow('snapshot insert failed');
  });
});

describe('StateOfRecordRepository.readAt — version-pinned vs latest', () => {
  it('reads a specific version with a version predicate', async () => {
    const ex = new FakeExecutor();
    ex.setOne({
      aggregate: 'run',
      aggregate_id: 'r1',
      version: 2,
      payload: { s: 'x' },
      user_id: 'u1',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const repo = new StateOfRecordRepository(ex);
    const snap = await repo.readAt('run', 'r1', 2);
    expect(ex.calls[0].sql).toContain('version = :version');
    expect(ex.calls[0].params.version).toBe(2);
    expect(snap).toEqual({
      aggregate: 'run',
      aggregateId: 'r1',
      version: 2,
      payload: { s: 'x' },
      userId: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('reads the latest (order by version desc) when no version is given', async () => {
    const ex = new FakeExecutor();
    ex.setOne({ aggregate: 'run', aggregate_id: 'r1', version: 9, payload: null, user_id: 'u1' });
    const repo = new StateOfRecordRepository(ex);
    const snap = await repo.readAt('run', 'r1');
    expect(ex.calls[0].sql).toContain('order by version desc');
    expect(ex.calls[0].sql).not.toContain('version = :version');
    expect(snap?.version).toBe(9);
    expect(snap?.payload).toBeNull();
  });

  it('returns null when the aggregate has no snapshot', async () => {
    const ex = new FakeExecutor();
    ex.setOne(null);
    const repo = new StateOfRecordRepository(ex);
    expect(await repo.readAt('run', 'missing')).toBeNull();
  });
});

describe('StateOfRecordRepository.events — ordered audit log mapping', () => {
  it('maps rows in seq order and normalizes a null actor', async () => {
    const ex = new FakeExecutor();
    ex.setRead([
      {
        seq: 1,
        aggregate: 'run',
        aggregate_id: 'r1',
        event_type: 'created',
        actor_id: 'agent-1',
        payload: { a: 1 },
        recorded_at: '2026-01-01T00:00:00.000Z',
      },
      {
        seq: 2,
        aggregate: 'run',
        aggregate_id: 'r1',
        event_type: 'updated',
        actor_id: null,
        payload: null,
        recorded_at: '2026-01-02T00:00:00.000Z',
      },
    ]);
    const repo = new StateOfRecordRepository(ex);
    const events = await repo.events('run', 'r1');
    expect(ex.calls[0].sql).toContain('order by seq asc');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ seq: 1, eventType: 'created', actorId: 'agent-1', payload: { a: 1 } });
    expect(events[1]).toMatchObject({ seq: 2, eventType: 'updated', actorId: null, payload: null });
  });

  it('returns an empty array when there are no events', async () => {
    const ex = new FakeExecutor();
    ex.setRead([]);
    const repo = new StateOfRecordRepository(ex);
    expect(await repo.events('run', 'none')).toEqual([]);
  });
});
