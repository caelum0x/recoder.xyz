'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { A2AWorkspace, WorkspaceSettings } from '@recoder/shared/a2a';

const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => [...workspaceKeys.all, 'list'] as const,
  detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
  agents: (id: string) => [...workspaceKeys.all, 'agents', id] as const,
};

/**
 * A2A workspace list response from docker-backend.
 * The workspace service returns { workspaces: A2AWorkspace[], total: number }.
 */
interface WorkspaceListResponse {
  workspaces: A2AWorkspace[];
  total: number;
}

export function useWorkspaces() {
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);

  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async () => {
      const res = await dockerBackendApi.get<WorkspaceListResponse>('/api/a2a/workspaces');
      if (res.success && res.data) {
        setWorkspaces(res.data.workspaces);
        return res.data;
      }
      throw new Error(res.error?.message || 'Failed to fetch workspaces');
    },
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
  });
}

export function useWorkspace(id: string | null) {
  return useQuery({
    queryKey: workspaceKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<A2AWorkspace>(`/api/a2a/workspaces/${id}`);
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch workspace');
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);

  return useMutation({
    mutationFn: async (input: {
      name: string;
      projectId: string;
      ownerId?: string;
      memberAgentIds?: string[];
      settings?: Partial<WorkspaceSettings>;
    }) => {
      const res = await dockerBackendApi.post<A2AWorkspace>('/api/a2a/workspaces', {
        name: input.name,
        projectId: input.projectId,
        ownerId: input.ownerId,
        memberAgentIds: input.memberAgentIds,
        settings: input.settings,
      });
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to create workspace');
    },
    onSuccess: (workspace) => {
      addWorkspace(workspace);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; settings?: Partial<WorkspaceSettings> }) => {
      const res = await dockerBackendApi.patch<A2AWorkspace>(`/api/a2a/workspaces/${id}`, {
        ...(input.name ? { name: input.name } : {}),
        ...(input.settings ? { settings: input.settings } : {}),
      });
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to update workspace');
    },
    onSuccess: (workspace) => {
      updateWorkspace(workspace.workspaceId, workspace);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspace.workspaceId) });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await dockerBackendApi.delete(`/api/a2a/workspaces/${id}`);
      if (res.success) return id;
      throw new Error(res.error?.message || 'Failed to delete workspace');
    },
    onSuccess: (id) => {
      removeWorkspace(id);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}

export function useWorkspaceAgents(wsId: string | null) {
  return useQuery({
    queryKey: workspaceKeys.agents(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ agents: string[] }>(`/api/a2a/workspaces/${wsId}/agents`);
      if (res.success && res.data) {
        return { agents: res.data.agents || [], total: (res.data.agents || []).length };
      }
      throw new Error(res.error?.message || 'Failed to fetch agents');
    },
    enabled: !!wsId,
    staleTime: 15_000,
  });
}

export function useAddWorkspaceAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wsId, agentId }: { wsId: string; agentId: string }) => {
      const res = await dockerBackendApi.post<{ workspace_id: string; agent_id: string; added: boolean }>(
        `/api/a2a/workspaces/${wsId}/agents`,
        { agentId },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to add agent');
    },
    onSuccess: (_, { wsId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wsId) });
    },
  });
}

export function useRemoveWorkspaceAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wsId, agentId }: { wsId: string; agentId: string }) => {
      const res = await dockerBackendApi.delete(`/api/a2a/workspaces/${wsId}/agents/${agentId}`);
      if (res.success) return { wsId, agentId };
      throw new Error(res.error?.message || 'Failed to remove agent');
    },
    onSuccess: (_, { wsId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wsId) });
    },
  });
}
