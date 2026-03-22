import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listPlugins,
  createPlugin,
  updatePlugin,
  deletePlugin,
  installPlugin,
  listAgentPlugins,
  updatePluginInstall,
  uninstallPlugin,
  ratePlugin,
  type Plugin,
  type PluginInstall,
  type PluginRating,
  type PluginFilters,
  type CreatePluginData,
  type UpdatePluginData,
  type InstallPluginData,
  type UpdateInstallData,
  type RatePluginData,
} from '@/lib/api/plugin-registry';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const pluginKeys = {
  all: ['plugins'] as const,
  lists: () => [...pluginKeys.all, 'list'] as const,
  list: (filters?: PluginFilters) => [...pluginKeys.lists(), filters] as const,
  agentPlugins: (agentId: string) => ['agent-plugins', agentId] as const,
};

// ---------------------------------------------------------------------------
// Hooks — Plugin marketplace
// ---------------------------------------------------------------------------

export const usePlugins = (filters?: PluginFilters) => {
  return useQuery<Plugin[]>({
    queryKey: pluginKeys.list(filters),
    queryFn: () => listPlugins(filters),
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useCreatePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation<Plugin, Error, CreatePluginData>({
    mutationFn: (data) => createPlugin(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Plugin created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create plugin');
    },
  });
};

export const useUpdatePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation<Plugin, Error, { pluginId: string; data: UpdatePluginData }>({
    mutationFn: ({ pluginId, data }) => updatePlugin(pluginId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Plugin updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update plugin');
    },
  });
};

export const useDeletePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (pluginId) => deletePlugin(pluginId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Plugin deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete plugin');
    },
  });
};

// ---------------------------------------------------------------------------
// Hooks — Agent plugin installs
// ---------------------------------------------------------------------------

export const useInstallPlugin = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation<PluginInstall, Error, InstallPluginData>({
    mutationFn: (data) => installPlugin(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.agentPlugins(agentId) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Plugin installed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to install plugin');
    },
  });
};

export const useAgentPlugins = (agentId: string) => {
  return useQuery<PluginInstall[]>({
    queryKey: pluginKeys.agentPlugins(agentId),
    queryFn: () => listAgentPlugins(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useUpdatePluginInstall = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation<PluginInstall, Error, { installId: string; data: UpdateInstallData }>({
    mutationFn: ({ installId, data }) => updatePluginInstall(agentId, installId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.agentPlugins(agentId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update plugin install');
    },
  });
};

export const useUninstallPlugin = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (installId) => uninstallPlugin(agentId, installId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.agentPlugins(agentId) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Plugin uninstalled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to uninstall plugin');
    },
  });
};

// ---------------------------------------------------------------------------
// Hooks — Ratings
// ---------------------------------------------------------------------------

export const useRatePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation<PluginRating, Error, { pluginId: string; data: RatePluginData }>({
    mutationFn: ({ pluginId, data }) => ratePlugin(pluginId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
      toast.success('Rating submitted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit rating');
    },
  });
};

export type { Plugin, PluginInstall, PluginRating, PluginFilters, CreatePluginData, UpdatePluginData };
