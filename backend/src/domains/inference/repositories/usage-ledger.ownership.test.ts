/**
 * `PgUsageLedgerRepository.ownsInference` — the cross-tenant ownership probe the
 * feedback guard consults. Proves: a matching `(inference_id, user_id)` row ⇒
 * true; no row ⇒ false; and it FAILS CLOSED (returns false) when the executor is
 * unavailable, the ids are empty, or the read errors — so a fault is never a
 * feedback-poisoning oracle.
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

describe('PgUsageLedgerRepository.ownsInference', () => {
  it('returns true when a ledger row attributes the inference to the user', async () => {
    const one = vi.fn(async () => ({ owned: 1 }) as unknown as QueryRow);
    const repo = new PgUsageLedgerRepository(executor({ one }), log);

    await expect(repo.ownsInference('user-A', 'inf-1')).resolves.toBe(true);
    // Scoped by BOTH inference_id AND user_id (the tenant boundary).
    expect(one).toHaveBeenCalledWith(expect.stringContaining('inference_id = :inference_id'), {
      inference_id: 'inf-1',
      user_id: 'user-A',
    });
    expect(one.mock.calls[0]?.[0]).toContain('user_id = :user_id');
  });

  it('returns false when no owned row exists (a foreign / missing inference)', async () => {
    const repo = new PgUsageLedgerRepository(executor({ one: vi.fn(async () => null) }), log);
    await expect(repo.ownsInference('tenant-B', 'inf-owned-by-A')).resolves.toBe(false);
  });

  it('fails CLOSED (false) without querying when the executor is unavailable', async () => {
    const one = vi.fn(async () => ({ owned: 1 }) as unknown as QueryRow);
    const repo = new PgUsageLedgerRepository(executor({ one, available: false }), log);
    await expect(repo.ownsInference('user-A', 'inf-1')).resolves.toBe(false);
    expect(one).not.toHaveBeenCalled();
  });

  it('fails CLOSED (false) for empty ids without querying', async () => {
    const one = vi.fn(async () => ({ owned: 1 }) as unknown as QueryRow);
    const repo = new PgUsageLedgerRepository(executor({ one }), log);
    await expect(repo.ownsInference('', 'inf-1')).resolves.toBe(false);
    await expect(repo.ownsInference('user-A', '')).resolves.toBe(false);
    expect(one).not.toHaveBeenCalled();
  });

  it('fails CLOSED (false) when the read throws (a fault is never an oracle)', async () => {
    const one = vi.fn(async () => {
      throw new Error('db down');
    });
    const repo = new PgUsageLedgerRepository(executor({ one }), log);
    await expect(repo.ownsInference('user-A', 'inf-1')).resolves.toBe(false);
  });
});
