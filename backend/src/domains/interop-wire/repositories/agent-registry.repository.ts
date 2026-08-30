/**
 * `createAgentRegistryRepo` — the {@link AgentRegistryRepo} impl over the
 * persistence {@link QueryExecutor} (`interop_agents` + `interop_heartbeats`).
 *
 * All access is parameterized `:param` SQL with app-layer tenancy
 * (`WHERE user_id = :user_id`) — NO Supabase RLS. The agent-card is stored in the
 * `card` JSONB column.
 *
 * DEGRADE-SAFE: when `executor.isAvailable()` is false the repo serves from a
 * bounded in-process store so registry/heartbeat reads work in-memory rather than
 * crashing, and it NEVER fabricates a persisted row it did not write.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type {
  AgentCard,
  AgentRow,
  AgentStatus,
  HeartbeatSample,
  UpsertAgentInput,
} from '../types.js';

export interface AgentRegistryRepoDeps {
  readonly executor: QueryExecutor;
}

function decodeCard(raw: unknown): AgentCard {
  const obj = typeof raw === 'string' ? safeParse(raw) : raw;
  if (typeof obj !== 'object' || obj === null)
    return { id: 'unknown', name: 'unknown', capabilities: [] };
  const r = obj as Record<string, unknown>;
  return {
    id: typeof r.id === 'string' ? r.id : 'unknown',
    name: typeof r.name === 'string' ? r.name : 'unknown',
    description: typeof r.description === 'string' ? r.description : undefined,
    url: typeof r.url === 'string' ? r.url : undefined,
    capabilities: Array.isArray(r.capabilities)
      ? r.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
    publicKey: typeof r.publicKey === 'string' ? r.publicKey : undefined,
    version: typeof r.version === 'string' ? r.version : undefined,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rowToAgent(row: QueryRow): AgentRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: (row.kind as AgentRow['kind']) ?? 'remote_a2a',
    runtimeId: row.runtime_id == null ? undefined : String(row.runtime_id),
    card: decodeCard(row.card),
    publicKey: row.public_key == null ? undefined : String(row.public_key),
    status: (row.status as AgentStatus) ?? 'unknown',
    createdAt: row.created_at == null ? undefined : String(row.created_at),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

/** Build the agent-registry repository over the persistence executor. */
export function createAgentRegistryRepo(
  deps: AgentRegistryRepoDeps
): AgentRegistryRepo {
  const { executor } = deps;
  // Agent/card ids are protocol identities, not globally unique tenant keys.
  // Every in-memory and durable lookup is therefore keyed by (userId, agentId).
  const memAgents = new Map<string, AgentRow>();
  const memHeartbeats = new Map<string, HeartbeatSample>();
  const durable = (): boolean => executor.isAvailable();
  const ownedKey = (id: string, userId: string): string => `${userId}\0${id}`;

  async function upsert(input: UpsertAgentInput): Promise<AgentRow> {
    const row: AgentRow = {
      id: input.id,
      userId: input.userId,
      kind: input.kind,
      runtimeId: input.runtimeId,
      card: input.card,
      publicKey: input.publicKey,
      status: input.status ?? 'unknown',
    };
    memAgents.set(ownedKey(input.id, input.userId), row);
    if (!durable()) return row;
    await executor.mutate(
      `insert into interop_agents
         (id, user_id, kind, runtime_id, card, public_key, status, created_at, updated_at)
       values
         (:id, :user_id, :kind, :runtime_id, cast(:card as jsonb), :public_key, :status, now(), now())
       on conflict (id, user_id) do update set
         kind = excluded.kind,
         runtime_id = excluded.runtime_id,
         card = excluded.card,
         public_key = excluded.public_key,
         status = excluded.status,
         updated_at = now()`,
      {
        id: input.id,
        user_id: input.userId,
        kind: input.kind,
        runtime_id: input.runtimeId ?? null,
        card: JSON.stringify(input.card),
        public_key: input.publicKey ?? null,
        status: input.status ?? 'unknown',
      }
    );
    return row;
  }

  async function get(id: string, userId: string): Promise<AgentRow | null> {
    if (!durable()) {
      return memAgents.get(ownedKey(id, userId)) ?? null;
    }
    const rows = await executor.execute<QueryRow>(
      `select * from interop_agents where id = :id and user_id = :user_id`,
      { id, user_id: userId }
    );
    return rows[0] ? rowToAgent(rows[0]) : null;
  }

  async function list(
    userId: string,
    kind?: AgentRow['kind']
  ): Promise<readonly AgentRow[]> {
    if (!durable()) {
      return [...memAgents.values()].filter(
        a => a.userId === userId && (!kind || a.kind === kind)
      );
    }
    const rows = kind
      ? await executor.execute<QueryRow>(
          `select * from interop_agents where user_id = :user_id and kind = :kind order by updated_at desc`,
          { user_id: userId, kind }
        )
      : await executor.execute<QueryRow>(
          `select * from interop_agents where user_id = :user_id order by updated_at desc`,
          { user_id: userId }
        );
    return rows.map(rowToAgent);
  }

  async function setStatus(
    id: string,
    userId: string,
    status: AgentStatus
  ): Promise<boolean> {
    const key = ownedKey(id, userId);
    const existing = memAgents.get(key);
    if (existing) memAgents.set(key, { ...existing, status });
    if (!durable()) return Boolean(existing);
    const affected = await executor.mutate(
      `update interop_agents set status = :status, updated_at = now() where id = :id and user_id = :user_id`,
      { status, id, user_id: userId }
    );
    return affected > 0;
  }

  async function remove(id: string, userId: string): Promise<boolean> {
    const key = ownedKey(id, userId);
    const existing = memAgents.get(key);
    if (existing) {
      memAgents.delete(key);
      memHeartbeats.delete(key);
    }
    if (!durable()) return Boolean(existing);
    const affected = await executor.mutate(
      `delete from interop_agents where id = :id and user_id = :user_id`,
      { id, user_id: userId }
    );
    return affected > 0;
  }

  async function recordHeartbeat(sample: HeartbeatSample): Promise<void> {
    memHeartbeats.set(ownedKey(sample.agentId, sample.userId), sample);
    if (!durable()) return;
    await executor.mutate(
      `insert into interop_heartbeats (agent_id, user_id, seen_at, latency_ms, ok)
       values (:agent_id, :user_id, coalesce(cast(:seen_at as timestamptz), now()), :latency_ms, :ok)
       on conflict (agent_id, user_id, seen_at) do nothing`,
      {
        agent_id: sample.agentId,
        user_id: sample.userId,
        seen_at: sample.seenAt ?? null,
        latency_ms: sample.latencyMs ?? null,
        ok: sample.ok,
      }
    );
  }

  async function lastHeartbeat(
    agentId: string,
    userId: string
  ): Promise<HeartbeatSample | null> {
    if (!durable()) return memHeartbeats.get(ownedKey(agentId, userId)) ?? null;
    const rows = await executor.execute<QueryRow>(
      `select agent_id, user_id, seen_at, latency_ms, ok from interop_heartbeats
       where agent_id = :agent_id and user_id = :user_id order by seen_at desc limit 1`,
      { agent_id: agentId, user_id: userId }
    );
    const row = rows[0];
    if (!row) return memHeartbeats.get(ownedKey(agentId, userId)) ?? null;
    return {
      agentId: String(row.agent_id),
      userId: String(row.user_id),
      seenAt: String(row.seen_at),
      latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms),
      ok: Boolean(row.ok),
    };
  }

  return {
    upsert,
    get,
    list,
    setStatus,
    remove,
    recordHeartbeat,
    lastHeartbeat,
  };
}
