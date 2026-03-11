import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCacheStats,
  lookupCacheEntry,
  storeCacheEntry,
  invalidateCacheEntry,
  clearAgentCache,
  getCachePolicy,
  setCachePolicy,
  cleanupExpiredCache,
  type StoreCacheData,
  type SetCachePolicyData,
} from '@/lib/api/agent-output-cache';

export function useCacheStats(agentId: string) {
  return useQuery({
    queryKey: ['cache-stats', agentId],
    queryFn: () => getCacheStats(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useCacheLookup(agentId: string, cacheKey: string) {
  return useQuery({
    queryKey: ['cache-entry', agentId, cacheKey],
    queryFn: () => lookupCacheEntry(agentId, cacheKey),
    enabled: !!agentId && !!cacheKey,
    staleTime: 10_000,
    retry: false,
  });
}

export function useStoreCache(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StoreCacheData) => storeCacheEntry(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache-stats', agentId] });
      qc.invalidateQueries({ queryKey: ['cache-entry', agentId] });
    },
  });
}

export function useInvalidateCacheEntry(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cacheKey: string) => invalidateCacheEntry(agentId, cacheKey),
    onSuccess: (_data, cacheKey) => {
      qc.invalidateQueries({ queryKey: ['cache-stats', agentId] });
      qc.removeQueries({ queryKey: ['cache-entry', agentId, cacheKey] });
    },
  });
}

export function useClearAgentCache(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearAgentCache(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache-stats', agentId] });
      qc.removeQueries({ queryKey: ['cache-entry', agentId] });
    },
  });
}

export function useCachePolicy(agentId: string) {
  return useQuery({
    queryKey: ['cache-policy', agentId],
    queryFn: () => getCachePolicy(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useSetCachePolicy(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SetCachePolicyData) => setCachePolicy(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache-policy', agentId] });
    },
  });
}

export function useCleanupCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cleanupExpiredCache,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache-stats'] });
    },
  });
}
