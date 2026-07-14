import { describe, it, expect } from 'vitest';
import { BaseRepository } from '../repositories/base.repository.js';
import type { QueryExecutor, QueryParams } from '../ports/query-executor.port.js';
import type { QueryRow } from '../types.js';

interface Widget {
  id: string;
  userId: string;
  name: string;
}

/** Records the last query + params and returns canned rows. */
class FakeExecutor implements QueryExecutor {
  calls: Array<{ sql: string; params: QueryParams }> = [];
  nextRows: QueryRow[] = [];
  nextRowCount = 0;

  private record<T>(sql: string, params: QueryParams): T[] {
    this.calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return this.nextRows as unknown as T[];
  }
  async execute<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    return this.record<T>(sql, params);
  }
  async read<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    return this.record<T>(sql, params);
  }
  async one<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<T | null> {
    const rows = this.record<T>(sql, params);
    return rows[0] ?? null;
  }
  async mutate(sql: string, params: QueryParams = {}): Promise<number> {
    this.record(sql, params);
    return this.nextRowCount;
  }
  async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
  isAvailable(): boolean {
    return true;
  }
}

class WidgetRepo extends BaseRepository<Widget> {
  constructor(executor: QueryExecutor) {
    super(executor, { table: 'core.widgets', idColumn: 'id', userColumn: 'user_id' });
  }
  protected mapRow(row: QueryRow): Widget {
    return { id: String(row.id), userId: String(row.user_id), name: String(row.name) };
  }
  protected toColumns(entity: Partial<Widget>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (entity.id !== undefined) out.id = entity.id;
    if (entity.userId !== undefined) out.user_id = entity.userId;
    if (entity.name !== undefined) out.name = entity.name;
    return out;
  }
}

describe('BaseRepository tenant scoping', () => {
  it('adds a WHERE user_id guard to findAll when scoped', async () => {
    const exec = new FakeExecutor();
    const repo = new WidgetRepo(exec);
    await repo.findAll({ userId: 'u1' });
    const call = exec.calls[0];
    expect(call.sql).toContain('where user_id = :user_id');
    expect(call.params).toEqual({ user_id: 'u1' });
  });

  it('scopes findById by both id and user_id (cross-tenant denial)', async () => {
    const exec = new FakeExecutor();
    const repo = new WidgetRepo(exec);
    await repo.findById('w1', { userId: 'u1' });
    const call = exec.calls[0];
    expect(call.sql).toContain('id = :id and user_id = :user_id');
    expect(call.params).toEqual({ id: 'w1', user_id: 'u1' });
  });

  it('returns null when the scoped row is not owned (no row)', async () => {
    const exec = new FakeExecutor();
    exec.nextRows = [];
    const repo = new WidgetRepo(exec);
    const found = await repo.findById('w1', { userId: 'other' });
    expect(found).toBeNull();
  });

  it('forces the owner column on create from the scope', async () => {
    const exec = new FakeExecutor();
    exec.nextRows = [{ id: 'w1', user_id: 'u1', name: 'a' }];
    const repo = new WidgetRepo(exec);
    await repo.create({ id: 'w1', userId: 'ignored', name: 'a' }, { userId: 'u1' });
    const call = exec.calls[0];
    expect(call.params.user_id).toBe('u1');
    expect(call.sql).toContain('insert into core.widgets');
  });

  it('never lets a patch reassign id or owner, and scopes the update', async () => {
    const exec = new FakeExecutor();
    exec.nextRows = [{ id: 'w1', user_id: 'u1', name: 'b' }];
    const repo = new WidgetRepo(exec);
    await repo.update('w1', { name: 'b', userId: 'attacker', id: 'w2' } as Partial<Widget>, { userId: 'u1' });
    const call = exec.calls[0];
    expect(call.sql).toContain('set name = :name');
    expect(call.sql).not.toContain('user_id = :user_id,');
    expect(call.sql).toContain('id = :id and user_id = :user_id');
    expect(call.params).not.toHaveProperty('user_id', 'attacker');
    expect(call.params.user_id).toBe('u1');
  });

  it('reports delete success from the affected row count', async () => {
    const exec = new FakeExecutor();
    exec.nextRowCount = 1;
    const repo = new WidgetRepo(exec);
    expect(await repo.delete('w1', { userId: 'u1' })).toBe(true);
    exec.nextRowCount = 0;
    expect(await repo.delete('w2', { userId: 'u1' })).toBe(false);
  });
});
