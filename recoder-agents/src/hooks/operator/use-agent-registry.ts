'use client';

import { useQuery } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';

// ---------------------------------------------------------------------------
// Types
//
// These mirror the docker-backend control-plane agent-registry wire shapes
// (GET /api/a2a/agents and GET /api/a2a/agents/:agentId). Both endpoints return
// the AgentWithHealth projection (RegisteredAgent + heartbeat health + optional
// durable identity): the list via discoverWithHealth(), the detail via
// getWithHealth(). They are declared locally rather than imported from
// @recoder/shared/a2a because that package does not expose the health/durable
// projection used by the registry service.
// ---------------------------------------------------------------------------

export interface AgentIdentity {
  id: string;
  name: string;
  platform: string;
  instanceId?: string;
  team?: string;
  version?: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  protocolVersion: string;
  version: string;
  url: string;
  skills: AgentSkill[];
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

/** Heartbeat-derived health, as projected by the registry (AgentHeartbeat). */
export interface AgentHealth {
  /** ISO-8601 timestamp of the last heartbeat (empty string when never seen). */
  lastHeartbeat: string;
  online: boolean;
}

/**
 * Durable identity + membership metadata that survives reconnects.
 *
 * Mirrors the docker-backend `AgentDurableIdentity` (agent-registry.service.ts)
 * exactly — field names must match the wire shape or the UI renders blanks.
 */
export interface AgentDurableIdentity {
  /** Stable agent id this identity is keyed by. */
  agentId: string;
  /** First time this agent id was ever observed (ISO). */
  firstSeenAt: string;
  /** Most recent reconnect/pairing time (ISO). */
  lastReconnectAt: string;
  /** Reconnects after the first registration. */
  reconnectCount: number;
  /** Workspaces this agent is a member of (accumulated, de-duplicated). */
  workspaceIds: string[];
  /** Most recently reported capability identifiers. */
  capabilities: string[];
}

/**
 * Full agent projection with heartbeat health + (optional) durable identity.
 *
 * Mirrors the docker-backend `AgentWithHealth` = RegisteredAgent + health +
 * optional `durable`, as returned by both the discovery list (GET /) and the
 * detail endpoint (GET /:agentId, getWithHealth).
 */
export interface AgentWithHealth {
  identity: AgentIdentity;
  card: AgentCard;
  protocol: string;
  tier: string;
  status: string;
  tags: string[];
  health: AgentHealth;
  durable?: AgentDurableIdentity;
}

interface AgentDiscoveryResponse {
  agents: AgentWithHealth[];
  count: number;
  query: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Query-key factory
// ---------------------------------------------------------------------------

const agentRegistryKeys = {
  all: ['agent-registry'] as const,
  list: (platform?: string) => [...agentRegistryKeys.all, 'list', platform ?? 'any'] as const,
  detail: (agentId: string) => [...agentRegistryKeys.all, 'detail', agentId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Discover registered agents with durable identity + heartbeat health.
 *
 * Sourced from the same control-plane registry that PM reads. Read-only.
 */
export function useAgentRegistry(filter?: { platform?: string }) {
  const platform = filter?.platform;

  return useQuery({
    queryKey: agentRegistryKeys.list(platform),
    queryFn: async () => {
      const qs = platform ? `?platform=${encodeURIComponent(platform)}` : '';
      const res = await dockerBackendApi.get<AgentDiscoveryResponse>(`/api/a2a/agents${qs}`);
      if (res.success && res.data) return res.data.agents ?? [];
      throw new Error(res.error?.message || 'Failed to fetch agent registry');
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export { agentRegistryKeys };
