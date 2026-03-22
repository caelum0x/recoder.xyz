import { backendApi } from '@/lib/api-client';

export type PluginType = 'tool' | 'prompt_modifier' | 'output_formatter' | 'data_source' | 'integration';

export interface Plugin {
  id: string;
  user_id: string;
  plugin_name: string;
  display_name: string;
  version: string;
  description: string | null;
  plugin_type: PluginType;
  config_schema: Record<string, unknown>;
  implementation: Record<string, unknown>;
  tags: string[];
  is_public: boolean;
  is_active: boolean;
  install_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface PluginInstall {
  id: string;
  user_id: string;
  agent_id: string;
  plugin_id: string;
  config_values: Record<string, unknown>;
  is_enabled: boolean;
  installed_at: string;
  // Joined fields from plugins table
  plugin_name?: string;
  display_name?: string;
  version?: string;
  description?: string | null;
  plugin_type?: PluginType;
  tags?: string[];
  is_public?: boolean;
  rating_avg?: number;
  rating_count?: number;
  install_count?: number;
}

export interface PluginRating {
  id: string;
  plugin_id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
}

export interface CreatePluginData {
  plugin_name: string;
  display_name: string;
  version?: string;
  description?: string;
  plugin_type?: PluginType;
  config_schema?: Record<string, unknown>;
  implementation?: Record<string, unknown>;
  tags?: string[];
  is_public?: boolean;
}

export interface UpdatePluginData {
  display_name?: string;
  version?: string;
  description?: string;
  plugin_type?: PluginType;
  config_schema?: Record<string, unknown>;
  implementation?: Record<string, unknown>;
  tags?: string[];
  is_public?: boolean;
  is_active?: boolean;
}

export interface PluginFilters {
  plugin_type?: PluginType | 'all';
  is_public?: boolean;
  search?: string;
  limit?: number;
}

export interface InstallPluginData {
  plugin_id: string;
  config_values?: Record<string, unknown>;
}

export interface UpdateInstallData {
  config_values?: Record<string, unknown>;
  is_enabled?: boolean;
}

export interface RatePluginData {
  rating: number;
  review?: string;
}

// ---------------------------------------------------------------------------
// Plugin CRUD
// ---------------------------------------------------------------------------

export const listPlugins = async (filters?: PluginFilters): Promise<Plugin[]> => {
  const params = new URLSearchParams();
  if (filters?.plugin_type && filters.plugin_type !== 'all') {
    params.set('plugin_type', filters.plugin_type);
  }
  if (filters?.is_public !== undefined) params.set('is_public', String(filters.is_public));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<Plugin[]>(
    `/plugins${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createPlugin = async (data: CreatePluginData): Promise<Plugin> => {
  const response = await backendApi.post<Plugin>('/plugins', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPlugin = async (pluginId: string): Promise<Plugin> => {
  const response = await backendApi.get<Plugin>(`/plugins/${pluginId}`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePlugin = async (pluginId: string, data: UpdatePluginData): Promise<Plugin> => {
  const response = await backendApi.patch<Plugin>(`/plugins/${pluginId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePlugin = async (pluginId: string): Promise<void> => {
  const response = await backendApi.delete(`/plugins/${pluginId}`);
  if (response.error) throw new Error(response.error.message);
};

// ---------------------------------------------------------------------------
// Agent Plugin Installs
// ---------------------------------------------------------------------------

export const installPlugin = async (agentId: string, data: InstallPluginData): Promise<PluginInstall> => {
  const response = await backendApi.post<PluginInstall>(`/agents/${agentId}/plugins`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listAgentPlugins = async (agentId: string): Promise<PluginInstall[]> => {
  const response = await backendApi.get<PluginInstall[]>(
    `/agents/${agentId}/plugins`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePluginInstall = async (
  agentId: string,
  installId: string,
  data: UpdateInstallData
): Promise<PluginInstall> => {
  const response = await backendApi.patch<PluginInstall>(
    `/agents/${agentId}/plugins/${installId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const uninstallPlugin = async (agentId: string, installId: string): Promise<void> => {
  const response = await backendApi.delete(`/agents/${agentId}/plugins/${installId}`);
  if (response.error) throw new Error(response.error.message);
};

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export const ratePlugin = async (pluginId: string, data: RatePluginData): Promise<PluginRating> => {
  const response = await backendApi.post<PluginRating>(`/plugins/${pluginId}/rate`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
