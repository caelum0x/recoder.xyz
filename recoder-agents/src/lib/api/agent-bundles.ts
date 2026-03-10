import { backendApi } from '@/lib/api-client';

export interface AgentBundle {
  id: string;
  user_id: string;
  agent_id: string | null;
  bundle_name: string;
  bundle_version: string;
  bundle_type: 'full' | 'config_only' | 'template';
  config_data?: Record<string, unknown>;
  included_sections: string[];
  file_size_bytes: number;
  checksum: string;
  is_public: boolean;
  download_count: number;
  created_at: string;
}

export interface ExportBundleData {
  bundle_name: string;
  bundle_type?: string;
  included_sections?: string[];
  is_public?: boolean;
}

export interface ImportBundleData {
  bundle_id?: string;
  bundle_data?: Record<string, unknown>;
}

export interface BundleListResponse {
  bundles: AgentBundle[];
  total: number;
  limit: number;
  offset: number;
}

export const exportAgentBundle = async (
  agentId: string,
  data: ExportBundleData
): Promise<AgentBundle> => {
  const response = await backendApi.post<AgentBundle>(
    `/agents/${agentId}/bundle-export`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const importAgentBundle = async (
  data: ImportBundleData
): Promise<{ agent_id: string; name: string; created_at: string; imported: Record<string, unknown> }> => {
  const response = await backendApi.post(`/agents/bundle-import`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentBundles = async (params?: {
  agent_id?: string;
  bundle_type?: string;
  limit?: number;
  offset?: number;
}): Promise<BundleListResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
  if (params?.bundle_type && params.bundle_type !== 'all')
    searchParams.set('bundle_type', params.bundle_type);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  const response = await backendApi.get<BundleListResponse>(
    `/bundles${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getBundleDetail = async (
  bundleId: string
): Promise<AgentBundle> => {
  const response = await backendApi.get<AgentBundle>(`/bundles/${bundleId}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteBundle = async (bundleId: string) => {
  const response = await backendApi.delete(`/bundles/${bundleId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getPublicBundles = async (params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<BundleListResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  const response = await backendApi.get<BundleListResponse>(
    `/bundles/public${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const downloadBundle = async (
  bundleId: string
): Promise<AgentBundle> => {
  const response = await backendApi.post<AgentBundle>(
    `/bundles/${bundleId}/download`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
