'use client';

import { useQuery } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';

// ---------------------------------------------------------------------------
// Types
//
// These mirror the docker-backend control-plane agent-registry wire shapes
// (GET /api/a2a/agents and GET /api/a2a/agents/:agentId). They are declared
// locally rather than imported from @recoder/shared/a2a because the frontend's
// shared package does not expose the health/lifecycle projection
// (AgentWithHealth) used by the registry's getWithHealth endpoint.
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

/** Heartbeat-derived health, as projected by the registry. */
export interface AgentHealth {
  /** ISO-8601 timestamp of the last heartbeat (empty string when never seen). */
  lastHeartbeat: string;
  online: boolean;
}

/** Durable lifecycle/identity metadata that survives reconnects. */
export interface AgentLifecycle {
  firstRegisteredAt: string;
  lastRegisteredAt: string;
  lastSeenAt: string;
  reconnectCount: number;
  registrationCount: number;
  lastInstanceId?: string;
}

/** Full agent projection with durable identity + health (getWithHealth). */
export interface AgentWithHealth {
  identity: AgentIdentity;
  card: AgentCard;
  protocol: string;
  tier: string;
  status: string;
  tags: string[];
  health: AgentHealth;
  lifecycle: AgentLifecycle;
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

/**
 * Fetch a single agent's full projection (identity + card + health + lifecycle).
 */
export function useAgentWithHealth(agentId: string | null) {
  return useQuery({
    queryKey: agentRegistryKeys.detail(agentId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentWithHealth>(
        `/api/a2a/agents/${encodeURIComponent(agentId as string)}`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch agent');
    },
    enabled: !!agentId,
    refetchInterval: 10_000,
  });
}

export { agentRegistryKeys };
