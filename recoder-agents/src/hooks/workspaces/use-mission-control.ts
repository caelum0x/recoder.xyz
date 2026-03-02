'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { dockerBackendApi, connectDockerSSE, type DockerSSEConnection } from '@/lib/docker-backend-api';
import { useAgentTeamStore, type AgentTeamMember } from '@/stores/agent-team-store';

const missionControlKeys = {
  fleet: (wsId: string) => ['mission-control', 'fleet', wsId] as const,
  pipeline: (wsId: string) => ['mission-control', 'pipeline', wsId] as const,
  metrics: (wsId: string) => ['mission-control', 'metrics', wsId] as const,
};

export function useAgentFleet(wsId: string | null) {
  const setAgents = useAgentTeamStore((s) => s.setAgents);

  return useQuery({
    queryKey: missionControlKeys.fleet(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ agents: AgentTeamMember[] }>(
        `/api/a2a/workspaces/${wsId}/agents`,
      );
      if (res.success && res.data) {
        // Map agent data to team members, using enriched info from bridge when available
        const members: AgentTeamMember[] = (res.data.agents as any[]).map((a: any) => ({
          agentId: typeof a === 'string' ? a : a.agentId,
          name: typeof a === 'string' ? a : a.name ?? a.agentId,
          platform: typeof a === 'string' ? 'custom' : a.platform ?? 'custom',
          status: typeof a === 'string' ? ('idle' as const) : (a.status ?? 'idle'),
          skills: typeof a === 'string' ? [] : a.skills ?? a.capabilities ?? [],
          isLocal: typeof a === 'string' ? false : a.isLocal ?? false,
          capabilities: typeof a === 'string' ? [] : a.capabilities ?? [],
          lastSeen: typeof a === 'string' ? undefined : a.lastSeen,
        }));
        setAgents(members);
        return members;
      }
      throw new Error(res.error?.message || 'Failed to fetch fleet');
    },
    enabled: !!wsId,
    staleTime: 15_000,
  });
}

export function useTaskPipeline(wsId: string | null) {
  return useQuery({
    queryKey: missionControlKeys.pipeline(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ tasks: Record<string, unknown>[] }>(
        `/api/a2a/workspaces/${wsId}/tasks`,
      );
      if (res.success && res.data) return res.data.tasks;
      throw new Error(res.error?.message || 'Failed to fetch tasks');
    },
    enabled: !!wsId,
    refetchInterval: 5_000,
  });
}

export function useSLOMetrics(wsId: string | null) {
  return useQuery({
    queryKey: missionControlKeys.metrics(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<Record<string, unknown>>('/api/a2a/metrics');
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch metrics');
    },
    enabled: !!wsId,
    staleTime: 30_000,
  });
}

/**
 * Subscribe to workspace-wide SSE for live activity updates.
 */
export function useActivityTimeline(
  wsId: string | null,
  onEvent?: (event: Record<string, unknown>) => void,
) {
  const connectionRef = useRef<DockerSSEConnection | null>(null);

  useEffect(() => {
    if (!wsId) return;

    connectionRef.current?.close();

    function forward(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        onEvent?.(data);
      } catch { /* ignore */ }
    }

    const connection = connectDockerSSE(
      `/api/a2a/workspaces/${wsId}/stream`,
      {
        'task.submitted': forward,
        'task.started': forward,
        'task.completed': forward,
        'task.failed': forward,
        'message.new': forward,
        'handoff.initiated': forward,
        'handoff.completed': forward,
        'approval.requested': forward,
        'approval.granted': forward,
        'approval.rejected': forward,
        'agent.online': forward,
        'agent.offline': forward,
      },
    );

    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [wsId, onEvent]);
}
