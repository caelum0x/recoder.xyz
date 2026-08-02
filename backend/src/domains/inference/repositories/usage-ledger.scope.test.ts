/**
 * `PgUsageLedgerRepository` workspace/task attribution — the per-workspace cost
 * strip prerequisite. Proves:
 *   - `append` persists `workspace_id` + `task_id` (null when unattributed),
 *   - `recentForUser` / `totalsForUser` stay user-global when no scope is given
 *     (no workspace/task predicates leak into the SQL),
 *   - a `workspaceId` / `taskId` scope adds the matching predicates + params so a
 *     scoped read never mixes another workspace's rows into the strip,
 *   - mapped records surface `workspaceId` / `taskId` truthfully.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { PgUsageLedgerRepository } from './usage-ledger.repository.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function executor(over: Partial<QueryExecutor> & { available?: boolean }): QueryExecutor {
  return {
    execute: vi.fn(),
    one: vi.fn(async () => null),
    read: vi.fn(async () => []),
    mutate: vi.fn(async () => 0),
    withTransaction: vi.fn(),
    isAvailable: () => over.available ?? true,
    ...over,
  } as unknown as QueryExecutor;
}

const LEDGER_ROW: QueryRow = {
  id: 7,
  user_id: 'user-A',
  model: 'openai/gpt-4o-mini',
  provider: 'openai',
  input_tokens: 10,
  output_tokens: 20,
  total_tokens: 30,
  cost_micro_usd: 42,
  tier: 'napi',
  inference_id: 'inf-1',
  workspace_id: 'ws-1',
  task_id: 'task-1',
  created_at: '2026-08-01T00:00:00.000Z',
} as unknown as QueryRow;

describe('PgUsageLedgerRepository workspace/task attribution', () => {
  it('append persists workspace_id + task_id and the record surfaces them', async () => {
    const one = vi.fn(async () => LEDGER_ROW);
    const repo = new PgUsageLedgerRepository(executor({ one }), log);

    const record = await repo.append({
      userId: 'user-A',
      model: 'openai/gpt-4o-mini',
      provider: 'openai',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      costMicroUsd: 42,
      tier: 'napi',
      inferenceId: 'inf-1',
      workspaceId: 'ws-1',
      taskId: 'task-1',
    });

    const [sql, params] = one.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).toContain('workspace_id');
    expect(sql).toContain('task_id');
    expect(params.workspace_id).toBe('ws-1');
    expect(params.task_id).toBe('task-1');
    expect(record?.workspaceId).toBe('ws-1');
    expect(record?.taskId).toBe('task-1');
  });

  it('append stores null attribution when workspace/task are absent (never fabricated)', async () => {
    const one = vi.fn(async () => null);
    const repo = new PgUsageLedgerRepository(executor({ one }), log);

    await repo.append({
      userId: 'user-A',
      model: 'openai/gpt-4o-mini',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      costMicroUsd: 0,
      tier: 'router',
    });

    const [, params] = one.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.workspace_id).toBeNull();
    expect(params.task_id).toBeNull();
  });

  it('recentForUser without a scope stays user-global (no workspace/task predicate)', async () => {
    const read = vi.fn(async () => [LEDGER_ROW]);
    const repo = new PgUsageLedgerRepository(executor({ read }), log);

    const rows = await repo.recentForUser('user-A', 50);

    const [sql, params] = read.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).not.toContain('workspace_id = :workspace_id');
    expect(sql).not.toContain('task_id = :task_id');
    expect(params.workspace_id).toBeUndefined();
    expect(rows[0]?.workspaceId).toBe('ws-1');
    expect(rows[0]?.taskId).toBe('task-1');
  });

  it('recentForUser with a scope filters by workspace_id AND task_id', async () => {
    const read = vi.fn(async () => []);
    const repo = new PgUsageLedgerRepository(executor({ read }), log);

    await repo.recentForUser('user-A', 50, { workspaceId: 'ws-1', taskId: 'task-1' });

    const [sql, params] = read.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).toContain('user_id = :user_id');
    expect(sql).toContain('workspace_id = :workspace_id');
    expect(sql).toContain('task_id = :task_id');
    expect(params.workspace_id).toBe('ws-1');
    expect(params.task_id).toBe('task-1');
  });

  it('totalsForUser with a workspace scope aggregates only that workspace', async () => {
    const one = vi.fn(
      async () =>
        ({ input_tokens: 5, output_tokens: 6, total_tokens: 11, cost_micro_usd: 7, calls: 2 }) as unknown as QueryRow,
    );
    const repo = new PgUsageLedgerRepository(executor({ one }), log);

    const totals = await repo.totalsForUser('user-A', undefined, { workspaceId: 'ws-1' });

    const [sql, params] = one.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).toContain('workspace_id = :workspace_id');
    expect(sql).not.toContain('task_id = :task_id');
    expect(params.workspace_id).toBe('ws-1');
    expect(totals).toEqual({ inputTokens: 5, outputTokens: 6, totalTokens: 11, costMicroUsd: 7, calls: 2 });
  });

  it('totalsForUser without a scope keeps the user-global aggregate SQL', async () => {
    const one = vi.fn(async () => null);
    const repo = new PgUsageLedgerRepository(executor({ one }), log);

    await repo.totalsForUser('user-A');

    const [sql] = one.mock.calls[0] as unknown as [string];
    expect(sql).not.toContain('workspace_id');
    expect(sql).not.toContain('task_id');
  });
});
