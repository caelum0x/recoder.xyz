/**
 * `AgentRegistryRepo` — the persistence seam for registered A2A agents / runtime
 * endpoints (`interop_agents`) + their liveness heartbeats (`interop_heartbeats`).
 *
 * The concrete impl (`repositories/agent-registry.repository.ts`) binds this to
 * the persistence `QueryExecutor` with `:param` SQL and app-layer
 * `WHERE user_id = :user_id` tenancy. Callers depend on THIS interface, never on
 * the executor directly. Interface only.
 */
import type { AgentRow, AgentStatus, HeartbeatSample, UpsertAgentInput } from '../types.js';

export interface AgentRegistryRepo {
  /** Register/upsert an agent endpoint; returns the persisted row. */
  upsert(input: UpsertAgentInput): Promise<AgentRow>;
  /** One agent by id, scoped to its owner; `null` when absent / not owned. */
  get(id: string, userId: string): Promise<AgentRow | null>;
  /** All agents visible to an owner, optionally filtered by kind. */
  list(userId: string, kind?: AgentRow['kind']): Promise<readonly AgentRow[]>;
  /** Update just the liveness status of an agent (truthful; never fabricated). */
  setStatus(id: string, userId: string, status: AgentStatus): Promise<boolean>;
  /** Deregister an agent (cascades its heartbeats). */
  remove(id: string, userId: string): Promise<boolean>;
  /** Record a heartbeat sample for an agent. */
  recordHeartbeat(sample: HeartbeatSample): Promise<void>;
  /** The most recent heartbeat for an agent, or `null` when never seen. */
  lastHeartbeat(agentId: string): Promise<HeartbeatSample | null>;
}
