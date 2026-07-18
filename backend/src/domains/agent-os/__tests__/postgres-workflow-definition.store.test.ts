/**
 * `PostgresWorkflowDefinitionStore` — the DURABLE driver behind the
 * `WorkflowDefinitionStore` seam (Wave 4 P2: definitions survive restart).
 * Verifies contract parity with the in-memory store over a fake
 * `QueryExecutor` backed by an ordered Map: upsert is last-write-wins and
 * round-trips the full `@recoder/agent-workflows` document losslessly through
 * `payload`; get returns the stored definition or `null`; list preserves
 * insertion order (`seq`); delete reports whether a row was removed; and a
 * down pool rejects rather than faking success.
 */
import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition } from '@recoder/agent-workflows';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { PostgresWorkflowDefinitionStore } from '../adapters/postgres-workflow-definition.store.js';

function def(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    workflowId: 'wf-1',
    name: 'Verify then ship',
    version: '1.0.0',
    nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', config: {} }],
    ...overrides,
  };
}

/**
 * A tiny in-memory stand-in for the persistence executor, backing the
 * `agentos_workflow_definitions` table with an insertion-ordered Map keyed by
 * `workflow_id`. `payload` is stored as the JSON string the store binds (parity
 * with the real column) and parsed back on read, so the test exercises the
 * lossless jsonb round-trip.
 */
function fakeExecutor(options?: { throwAll?: boolean }): QueryExecutor {
  const rows = new Map<string, string>();
  const guard = () => {
    if (options?.throwAll) throw new Error('db down');
  };

  const mutate = async (sql: string, params?: QueryParams): Promise<number> => {
    guard();
    const p = (params ?? {}) as Record<string, unknown>;
    if (sql.includes('insert into')) {
      rows.set(String(p.workflow_id), String(p.payload));
      return 1;
    }
    if (sql.includes('delete from')) {
      return rows.delete(String(p.workflow_id)) ? 1 : 0;
    }
    return 0;
  };

  const one = async <T extends QueryRow = QueryRow>(
    _sql: string,
    params?: QueryParams,
  ): Promise<T | null> => {
    guard();
    const p = (params ?? {}) as Record<string, unknown>;
    const stored = rows.get(String(p.workflow_id));
    return stored === undefined ? null : ({ payload: JSON.parse(stored) } as unknown as T);
  };

  const read = async <T extends QueryRow = QueryRow>(): Promise<readonly T[]> => {
    guard();
    // Map preserves insertion order → parity with `seq asc` ordering.
    return [...rows.values()].map((s) => ({ payload: JSON.parse(s) }) as unknown as T);
  };

  return {
    one,
    mutate,
    read,
    execute: read,
    withTransaction: async (fn) => fn({ one, mutate, read } as unknown as QueryExecutor),
    isAvailable: () => !options?.throwAll,
  } as QueryExecutor;
}

describe('PostgresWorkflowDefinitionStore', () => {
  it('upserts, gets, and lists definitions with a lossless jsonb round-trip', async () => {
    const store = new PostgresWorkflowDefinitionStore(fakeExecutor());

    expect(await store.list()).toEqual([]);
    expect(await store.get('wf-1')).toBeNull();

    const saved = await store.upsert(def());
    expect(saved.workflowId).toBe('wf-1');

    // The whole document round-trips (no lossy column mapping).
    expect(await store.get('wf-1')).toEqual(def());
    expect(await store.list()).toEqual([def()]);
  });

  it('upsert is last-write-wins on the same workflow_id (parity with Map.set)', async () => {
    const store = new PostgresWorkflowDefinitionStore(fakeExecutor());
    await store.upsert(def());
    await store.upsert(def({ name: 'Renamed' }));

    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workflowId: 'wf-1', name: 'Renamed' });
  });

  it('list preserves insertion order (seq asc)', async () => {
    const store = new PostgresWorkflowDefinitionStore(fakeExecutor());
    await store.upsert(def({ workflowId: 'wf-a' }));
    await store.upsert(def({ workflowId: 'wf-b' }));
    await store.upsert(def({ workflowId: 'wf-c' }));

    expect((await store.list()).map((d) => d.workflowId)).toEqual(['wf-a', 'wf-b', 'wf-c']);
  });

  it('delete reports whether a row was removed (never throws on unknown id)', async () => {
    const store = new PostgresWorkflowDefinitionStore(fakeExecutor());
    await store.upsert(def());

    expect(await store.delete('wf-1')).toBe(true);
    expect(await store.delete('wf-1')).toBe(false);
    expect(await store.get('wf-1')).toBeNull();
  });

  it('a down pool rejects rather than faking success', async () => {
    const store = new PostgresWorkflowDefinitionStore(fakeExecutor({ throwAll: true }));
    await expect(store.upsert(def())).rejects.toThrow('db down');
    await expect(store.get('wf-1')).rejects.toThrow('db down');
    await expect(store.list()).rejects.toThrow('db down');
    await expect(store.delete('wf-1')).rejects.toThrow('db down');
  });
});
