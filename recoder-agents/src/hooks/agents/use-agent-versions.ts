import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { versionKeys } from './keys';
import { getAgentVersions, getAgentVersion, createAgentVersion, activateAgentVersion, updateAgentVersionDetails, AgentVersion, AgentVersionCreateRequest } from './utils';

export const useAgentVersions = (agentId: string, options?) => {
  return useQuery<AgentVersion[]>({
    queryKey: versionKeys.list(agentId),
    queryFn: () => getAgentVersions(agentId).then(versions => versions.sort((a, b) => b.version_number - a.version_number)),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    ...options,
  });
};

export const useAgentVersion = (agentId: string, versionId: string | null | undefined, options?) => {
  return useQuery<AgentVersion>({
    queryKey: versionKeys.detail(agentId, versionId!),
    queryFn: () => getAgentVersion(agentId, versionId!),
    enabled: !!agentId && !!versionId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    ...options,
  });
};

export const useCreateAgentVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<AgentVersion, Error, { agentId: string; data: AgentVersionCreateRequest }>({
    mutationFn: async ({ agentId, data }: { agentId: string; data: AgentVersionCreateRequest }) => {
      return createAgentVersion(agentId, data);
    },
    onSuccess: (newVersion, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      if (newVersion?.version_id) {
        queryClient.invalidateQueries({ queryKey: versionKeys.detail(agentId, newVersion.version_id) });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create version');
    },
  });
};

export const useActivateAgentVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { agentId: string; versionId: string }>({
    mutationFn: async ({ agentId, versionId }: { agentId: string; versionId: string }) => {
      return activateAgentVersion(agentId, versionId);
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Version activated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate version');
    },
  });
};

export const useUpdateVersionDetails = () => {
  const queryClient = useQueryClient();

  return useMutation<AgentVersion, Error, { agentId: string; versionId: string; data: { version_name?: string; change_description?: string } }>({
    mutationFn: async ({ 
      agentId, 
      versionId, 
      data 
    }: { 
      agentId: string; 
      versionId: string; 
      data: { version_name?: string; change_description?: string }
    }) => {
      return updateAgentVersionDetails(agentId, versionId, data);
    },
    onSuccess: (updatedVersion, { agentId, versionId }) => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: versionKeys.detail(agentId, versionId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Version details updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update version details');
    },
  });
};

export type { AgentVersion, AgentVersionCreateRequest };

// ============================================================================
// Config Snapshot Version Hooks (Sprint 46)
// ============================================================================

import { configVersionKeys } from './keys';
import {
  listConfigVersions,
  createConfigVersion,
  restoreConfigVersion,
  diffConfigVersions,
  deleteConfigVersion,
  type ConfigVersion,
  type ConfigVersionListResponse,
  type ConfigVersionDiffResponse,
} from '@/lib/api/agent-versions';

export const useConfigVersions = (agentId: string) => {
  return useQuery<ConfigVersionListResponse>({
    queryKey: configVersionKeys.list(agentId),
    queryFn: () => listConfigVersions(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useCreateConfigVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<ConfigVersion, Error, { agentId: string; data: { name?: string; description?: string } }>({
    mutationFn: ({ agentId, data }) => createConfigVersion(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configVersionKeys.list(agentId) });
      toast.success('Configuration snapshot saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save configuration snapshot');
    },
  });
};

export const useRestoreConfigVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<ConfigVersion, Error, { agentId: string; versionNumber: number }>({
    mutationFn: ({ agentId, versionNumber }) => restoreConfigVersion(agentId, versionNumber),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configVersionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Configuration restored from snapshot');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore configuration');
    },
  });
};

export const useConfigVersionDiff = (agentId: string, fromVersion: number, toVersion: number, enabled = false) => {
  return useQuery<ConfigVersionDiffResponse>({
    queryKey: configVersionKeys.diff(agentId, fromVersion, toVersion),
    queryFn: () => diffConfigVersions(agentId, fromVersion, toVersion),
    enabled: enabled && !!agentId && fromVersion > 0 && toVersion > 0,
    staleTime: 60000,
  });
};

export const useDeleteConfigVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean; version_number: number }, Error, { agentId: string; versionNumber: number }>({
    mutationFn: ({ agentId, versionNumber }) => deleteConfigVersion(agentId, versionNumber),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configVersionKeys.list(agentId) });
      toast.success('Config snapshot deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete config snapshot');
    },
  });
};

export type { ConfigVersion, ConfigVersionListResponse, ConfigVersionDiffResponse };
