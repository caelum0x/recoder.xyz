/**
 * `PgDeliveryOutcomeRepository` — the delivery audit trail over the persistence
 * `QueryExecutor`. Proves the degrade-safe boundaries (fake executor, no live DB):
 *  - `append` persists the outcome and the returned record maps every column,
 *  - absent optional fields are stored as their documented defaults/null (never
 *    fabricated) — `streamed`/`token_granular` default false; `latency`/`reason` null,
 *  - `append` is a no-op returning null when the executor is unavailable,
 *  - an append fault is swallowed to null (audit is best-effort, never a throw),
 *  - `recentForUser` is user-scoped, clamps the limit, and returns [] when the
 *    executor is unavailable or the read throws (truthful empty, never faked rows),
 *  - `isDurable` mirrors the executor availability.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { PgDeliveryOutcomeRepository } from './usage-ledger.repository.js';

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

const OUTCOME_ROW: QueryRow = {
  id: 11,
  user_id: 'user-A',
  model: 'openai/gpt-4o-mini',
  tier: 'napi',
  routed: true,
  streamed: true,
  token_granular: false,
  latency_ms: 420,
  status: 'ok',
  reason: null,
  created_at: '2026-08-01T00:00:00.000Z',
} as unknown as QueryRow;

describe('PgDeliveryOutcomeRepository', () => {
  it('append persists the outcome and maps every column of the returned record', async () => {
    const one = vi.fn(async () => OUTCOME_ROW);
    const repo = new PgDeliveryOutcomeRepository(executor({ one }), log);

    const record = await repo.append({
      userId: 'user-A',
      model: 'openai/gpt-4o-mini',
      tier: 'napi',
      routed: true,
      streamed: true,
      tokenGranular: false,
      latencyMs: 420,
      status: 'ok',
    });

    const [sql, params] = one.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).toContain('insert into inference_delivery_outcome');
    expect(params).toMatchObject({ user_id: 'user-A', model: 'openai/gpt-4o-mini', tier: 'napi', routed: true });
    expect(record).toEqual({
      id: '11',
      userId: 'user-A',
      model: 'openai/gpt-4o-mini',
      tier: 'napi',
      routed: true,
      streamed: true,
      tokenGranular: false,
      latencyMs: 420,
      status: 'ok',
      reason: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('stores documented defaults/null for absent optional fields (never fabricated)', async () => {
    const one = vi.fn(async () => null);
    const repo = new PgDeliveryOutcomeRepository(executor({ one }), log);

    await repo.append({ model: 'router', tier: 'router', routed: false, status: 'degraded' });

    const [, params] = one.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.user_id).toBeNull();
    expect(params.streamed).toBe(false);
    expect(params.token_granular).toBe(false);
    expect(params.latency_ms).toBeNull();
    expect(params.reason).toBeNull();
  });

  it('append is a no-op (null) without querying when the executor is unavailable', async () => {
    const one = vi.fn(async () => OUTCOME_ROW);
    const repo = new PgDeliveryOutcomeRepository(executor({ one, available: false }), log);

    await expect(repo.append({ model: 'm', tier: 'none', routed: false, status: 'failed' })).resolves.toBeNull();
    expect(one).not.toHaveBeenCalled();
  });

  it('swallows an append fault to null (audit is best-effort, never throws)', async () => {
    const one = vi.fn(async () => {
      throw new Error('constraint violation');
    });
    const repo = new PgDeliveryOutcomeRepository(executor({ one }), log);

    await expect(repo.append({ model: 'm', tier: 'napi', routed: true, status: 'ok' })).resolves.toBeNull();
  });

  it('recentForUser scopes by user_id and clamps an over-large limit', async () => {
    const read = vi.fn(async () => [OUTCOME_ROW]);
    const repo = new PgDeliveryOutcomeRepository(executor({ read }), log);

    const rows = await repo.recentForUser('user-A', 9999);

    const [sql, params] = read.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(sql).toContain('where user_id = :user_id');
    expect(params.user_id).toBe('user-A');
    expect(params.limit).toBe(500); // clamped from 9999
    expect(rows[0]?.userId).toBe('user-A');
  });

  it('recentForUser clamps a non-positive limit up to at least 1', async () => {
    const read = vi.fn(async () => []);
    const repo = new PgDeliveryOutcomeRepository(executor({ read }), log);

    await repo.recentForUser('user-A', 0);

    const [, params] = read.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.limit).toBe(1);
  });

  it('recentForUser returns [] without querying when the executor is unavailable', async () => {
    const read = vi.fn(async () => [OUTCOME_ROW]);
    const repo = new PgDeliveryOutcomeRepository(executor({ read, available: false }), log);

    await expect(repo.recentForUser('user-A')).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('recentForUser returns [] (truthful empty) when the read throws', async () => {
    const read = vi.fn(async () => {
      throw new Error('db down');
    });
    const repo = new PgDeliveryOutcomeRepository(executor({ read }), log);

    await expect(repo.recentForUser('user-A')).resolves.toEqual([]);
  });

  it('isDurable mirrors executor availability', async () => {
    expect(new PgDeliveryOutcomeRepository(executor({ available: true }), log).isDurable()).toBe(true);
    expect(new PgDeliveryOutcomeRepository(executor({ available: false }), log).isDurable()).toBe(false);
  });
});
