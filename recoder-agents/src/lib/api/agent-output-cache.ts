import { backendApi } from '@/lib/api-client';

export interface CacheEntry {
  id: string;
  user_id: string;
  agent_id: string;
  cache_key: string;
  input_hash: string;
  output: Record<string, unknown>;
  output_text: string | null;
  ttl_seconds: number;
  hit_count: number;
  expires_at: string;
  created_at: string;
}

export interface CacheStats {
  total_entries: number;
  total_hits: number;
  expired_count: number;
  hit_rate_pct: number;
}

export interface CachePolicy {
  id?: string;
  user_id?: string;
  agent_id: string;
  is_enabled: boolean;
  default_ttl_seconds: number;
  max_entries: number;
  cache_similar_inputs: boolean;
  similarity_threshold: number;
  configured: boolean;
  created_at?: string;
}

export interface StoreCacheData {
  cache_key: string;
  input_hash: string;
  output?: Record<string, unknown>;
  output_text?: string;
  ttl_seconds?: number;
}

export interface SetCachePolicyData {
  is_enabled?: boolean;
  default_ttl_seconds?: number;
  max_entries?: number;
  cache_similar_inputs?: boolean;
  similarity_threshold?: number;
}

export interface CleanupResult {
  status: string;
  deleted_count: number;
}

export const storeCacheEntry = async (
  agentId: string,
  data: StoreCacheData
): Promise<CacheEntry> => {
  const response = await backendApi.post<CacheEntry>(
    `/agents/${agentId}/cache`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const lookupCacheEntry = async (
  agentId: string,
  cacheKey: string
): Promise<CacheEntry> => {
  const response = await backendApi.get<CacheEntry>(
    `/agents/${agentId}/cache/${encodeURIComponent(cacheKey)}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const invalidateCacheEntry = async (
  agentId: string,
  cacheKey: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/agents/${agentId}/cache/${encodeURIComponent(cacheKey)}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const clearAgentCache = async (agentId: string): Promise<CleanupResult> => {
  const response = await backendApi.delete<CleanupResult>(
    `/agents/${agentId}/cache`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCacheStats = async (agentId: string): Promise<CacheStats> => {
  const response = await backendApi.get<CacheStats>(
    `/agents/${agentId}/cache/stats`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCachePolicy = async (agentId: string): Promise<CachePolicy> => {
  const response = await backendApi.get<CachePolicy>(
    `/agents/${agentId}/cache/policy`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const setCachePolicy = async (
  agentId: string,
  data: SetCachePolicyData
): Promise<CachePolicy> => {
  const response = await backendApi.put<CachePolicy>(
    `/agents/${agentId}/cache/policy`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cleanupExpiredCache = async (): Promise<CleanupResult> => {
  const response = await backendApi.post<CleanupResult>('/agents/cache/cleanup');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
