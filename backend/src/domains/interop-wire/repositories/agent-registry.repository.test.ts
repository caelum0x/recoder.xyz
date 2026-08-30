/**
 * A2A registry tenant isolation — agent/card ids are reusable protocol ids, so
 * every registry and heartbeat operation must key by (userId, agentId). These
 * tests lock the in-memory degrade path and the durable SQL shape to the same
 * invariant; neither tenant may overwrite, observe, or delete the other's row.
 */
import { describe, expect, it } from 'vitest';
import type {
  QueryExecutor,
  QueryParams,
} from '../../persistence/ports/query-executor.port.js';
import type { AgentCard, UpsertAgentInput } from '../types.js';
import { createHeartbeatSloService } from '../registry/heartbeat-slo.js';
import { createAgentRegistryRepo } from './agent-registry.repository.js';

const card = (name: string): AgentCard => ({
  id: 'runtime:codex',
  name,
  capabilities: ['message/send'],
});
const agent = (userId: string, name: string): UpsertAgentInput => ({
  id: 'runtime:codex',
  userId,
  kind: 'runtime',
  runtimeId: 'codex',
  card: card(name),
  status: 'unknown',
});

function unavailableExecutor(): QueryExecutor {
  return { isAvailable: () => false } as unknown as QueryExecutor;
}

describe('agent registry owner-scoped identity (in-memory degrade path)', () => {
  it('keeps the same public agent id independent for two owners', async () => {
    const repo = createAgentRegistryRepo({ executor: unavailableExecutor() });

    await repo.upsert(agent('tenant-a', 'Codex A'));
    await repo.upsert(agent('tenant-b', 'Codex B'));

    expect((await repo.get('runtime:codex', 'tenant-a'))?.card.name).toBe(
      'Codex A'
    );
    expect((await repo.get('runtime:codex', 'tenant-b'))?.card.name).toBe(
      'Codex B'
    );
    expect(await repo.list('tenant-a')).toHaveLength(1);
    expect(await repo.list('tenant-b')).toHaveLength(1);
  });

  it('isolates heartbeat samples, status reconciliation, and deletion by owner', async () => {
    const repo = createAgentRegistryRepo({ executor: unavailableExecutor() });
    await repo.upsert(agent('tenant-a', 'Codex A'));
    await repo.upsert(agent('tenant-b', 'Codex B'));
    const heartbeat = createHeartbeatSloService({
      registry: repo,
      staleMs: 60_000,
      now: () => 10_000,
    });

    await heartbeat.record({
      agentId: 'runtime:codex',
      userId: 'tenant-a',
      ok: true,
      seenAt: '1970-01-01T00:00:09.000Z',
    });
    await heartbeat.record({
      agentId: 'runtime:codex',
      userId: 'tenant-b',
      ok: false,
      seenAt: '1970-01-01T00:00:09.000Z',
    });

    expect(
      (await heartbeat.reconcile('runtime:codex', 'tenant-a')).status
    ).toBe('up');
    expect(
      (await heartbeat.reconcile('runtime:codex', 'tenant-b')).status
    ).toBe('down');
    expect((await repo.get('runtime:codex', 'tenant-a'))?.status).toBe('up');
    expect((await repo.get('runtime:codex', 'tenant-b'))?.status).toBe('down');

    expect(await repo.remove('runtime:codex', 'tenant-a')).toBe(true);
    expect(await repo.get('runtime:codex', 'tenant-a')).toBeNull();
    expect((await repo.get('runtime:codex', 'tenant-b'))?.card.name).toBe(
      'Codex B'
    );
    expect((await heartbeat.liveness('runtime:codex', 'tenant-a')).status).toBe(
      'unknown'
    );
    expect((await heartbeat.liveness('runtime:codex', 'tenant-b')).status).toBe(
      'down'
    );
  });
});

describe('agent registry owner-scoped identity (durable SQL contract)', () => {
  it('keys upserts and heartbeat reads/writes by both agent and owner', async () => {
    const mutations: Array<{ sql: string; params?: QueryParams }> = [];
    const reads: Array<{ sql: string; params?: QueryParams }> = [];
    const executor = {
      isAvailable: () => true,
      mutate: async (sql: string, params?: QueryParams) => {
        mutations.push({ sql, params });
        return 1;
      },
      execute: async (sql: string, params?: QueryParams) => {
        reads.push({ sql, params });
        return [];
      },
    } as unknown as QueryExecutor;
    const repo = createAgentRegistryRepo({ executor });

    await repo.upsert(agent('tenant-a', 'Codex A'));
    await repo.recordHeartbeat({
      agentId: 'runtime:codex',
      userId: 'tenant-a',
      ok: true,
      seenAt: '2026-08-30T00:00:00.000Z',
    });
    await repo.lastHeartbeat('runtime:codex', 'tenant-a');

    const normalizedMutations = mutations.map(({ sql }) =>
      sql.replace(/\s+/g, ' ').trim()
    );
    expect(normalizedMutations[0]).toContain(
      'on conflict (id, user_id) do update'
    );
    expect(normalizedMutations[1]).toContain(
      'interop_heartbeats (agent_id, user_id, seen_at'
    );
    expect(normalizedMutations[1]).toContain(
      'on conflict (agent_id, user_id, seen_at) do nothing'
    );
    expect(mutations[1]?.params).toMatchObject({
      agent_id: 'runtime:codex',
      user_id: 'tenant-a',
    });

    const heartbeatRead = reads.at(-1)!;
    expect(heartbeatRead.sql.replace(/\s+/g, ' ')).toContain(
      'where agent_id = :agent_id and user_id = :user_id'
    );
    expect(heartbeatRead.params).toEqual({
      agent_id: 'runtime:codex',
      user_id: 'tenant-a',
    });
  });
});
