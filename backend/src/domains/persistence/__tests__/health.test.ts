import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { buildPersistenceHealth } from '../health.js';
import type { MigrationRunner } from '../ports/migration-runner.port.js';
import type { MigrationStatus } from '../types.js';

const upToDateRunner: MigrationRunner = {
  apply: async () => ({ applied: [], skipped: [], ok: true }),
  status: async (): Promise<MigrationStatus> => ({ applied: ['0000.sql'], pending: [], ok: true }),
};

const pendingRunner: MigrationRunner = {
  apply: async () => ({ applied: [], skipped: [], ok: true }),
  status: async (): Promise<MigrationStatus> => ({ applied: [], pending: ['0001.sql'], ok: true }),
};

function pingablePool(ok: boolean): Pool {
  return {
    query: (async () => {
      if (!ok) throw new Error('connection refused');
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }) as unknown as Pool['query'],
    totalCount: 2,
    idleCount: 2,
    waitingCount: 0,
  } as unknown as Pool;
}

describe('buildPersistenceHealth', () => {
  it('reports down when there is no pool', async () => {
    const health = await buildPersistenceHealth(null, upToDateRunner, 10);
    expect(health.status).toBe('down');
    expect(health.engines?.[0]?.status).toBe('down');
  });

  it('reports down when the pool ping fails', async () => {
    const health = await buildPersistenceHealth(pingablePool(false), upToDateRunner, 10);
    expect(health.status).toBe('down');
    expect(health.reason).toMatch(/ping failed/);
  });

  it('reports up when the pool pings and migrations are current', async () => {
    const health = await buildPersistenceHealth(pingablePool(true), upToDateRunner, 10);
    expect(health.status).toBe('up');
    expect(health.engines?.[0]?.status).toBe('up');
  });

  it('reports degraded when migrations are pending', async () => {
    const health = await buildPersistenceHealth(pingablePool(true), pendingRunner, 10);
    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    expect(health.reason).toMatch(/pending migration/);
  });
});
