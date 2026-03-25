'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { A2AWorkspace, WorkspaceSettings } from '@recoder/shared/a2a';

const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => [...workspaceKeys.all, 'list'] as const,
  detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
  agents: (id: string) => [...workspaceKeys.all, 'agents', id] as const,
};

// Backend returns a different shape than A2AWorkspace — map it
interface BackendWorkspace {
  id: string;
  user_id: string;
  workspace_name: string;
  description?: string;
  color?: string;
  icon?: string;
  agent_ids?: string[];
  thread_ids?: string[];
  is_default?: boolean;
  member_count?: number;
  agent_count?: number;
  thread_count?: number;
  created_at: string;
  updated_at: string;
}

function mapBackendToA2A(ws: BackendWorkspace): A2AWorkspace {
  return {
    workspaceId: ws.id,
    name: ws.workspace_name,
    projectId: '',
    ownerId: ws.user_id,
    memberAgentIds: ws.agent_ids || [],
    defaultChannelId: '',
    settings: {
      autoRouting: false,
      approvalRequired: false,
      worktreeIsolation: false,
      maxConcurrentTasks: 5,
      defaultOrchestrationPattern: 'direct',
    },
    createdAt: ws.created_at,
    updatedAt: ws.updated_at,
  };
}

export function useWorkspaces() {
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);

  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async () => {
      const res = await backendApi.get<BackendWorkspace[]>('/workspaces');
      if (res.success && res.data) {
        const workspaces = res.data.map(mapBackendToA2A);
        setWorkspaces(workspaces);
        return { workspaces, total: workspaces.length };
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
      const res = await backendApi.get<BackendWorkspace>(`/workspaces/${id}`);
      if (res.success && res.data) return mapBackendToA2A(res.data);
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
      const res = await backendApi.post<BackendWorkspace>('/workspaces', {
        workspace_name: input.name,
        description: '',
      });
      if (res.success && res.data) return mapBackendToA2A(res.data);
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
      const res = await backendApi.patch<BackendWorkspace>(`/workspaces/${id}`, {
        ...(input.name ? { workspace_name: input.name } : {}),
      });
      if (res.success && res.data) return mapBackendToA2A(res.data);
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
      const res = await backendApi.delete(`/workspaces/${id}`);
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
      // Backend workspace includes agent_ids in the detail response
      const res = await backendApi.get<BackendWorkspace>(`/workspaces/${wsId}`);
      if (res.success && res.data) {
        return { agents: res.data.agent_ids || [], total: (res.data.agent_ids || []).length };
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
      const res = await backendApi.post<{ workspace_id: string; agent_id: string; added: boolean }>(
        `/workspaces/${wsId}/agents`,
        { agent_id: agentId },
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
      const res = await backendApi.delete(`/workspaces/${wsId}/agents/${agentId}`);
      if (res.success) return { wsId, agentId };
      throw new Error(res.error?.message || 'Failed to remove agent');
    },
    onSuccess: (_, { wsId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(wsId) });
    },
  });
}
