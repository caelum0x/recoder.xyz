import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  exportAgentBundle,
  importAgentBundle,
  getAgentBundles,
  getBundleDetail,
  deleteBundle,
  getPublicBundles,
  downloadBundle,
  type ExportBundleData,
  type ImportBundleData,
} from '@/lib/api/agent-bundles';

const bundleKeys = {
  all: ['agent-bundles'] as const,
  lists: (agentId?: string, bundleType?: string) =>
    [...bundleKeys.all, 'list', agentId, bundleType] as const,
  detail: (bundleId: string) => [...bundleKeys.all, 'detail', bundleId] as const,
  public: (search?: string) => [...bundleKeys.all, 'public', search] as const,
};

export function useExportAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: ExportBundleData;
    }) => exportAgentBundle(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bundleKeys.all });
    },
  });
}

export function useImportAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBundleData) => importAgentBundle(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: bundleKeys.all });
    },
  });
}

export function useAgentBundles(agentId?: string, bundleType?: string) {
  return useQuery({
    queryKey: bundleKeys.lists(agentId, bundleType),
    queryFn: () =>
      getAgentBundles({ agent_id: agentId, bundle_type: bundleType }),
    staleTime: 30_000,
  });
}

export function useBundleDetail(bundleId: string) {
  return useQuery({
    queryKey: bundleKeys.detail(bundleId),
    queryFn: () => getBundleDetail(bundleId),
    enabled: !!bundleId,
    staleTime: 30_000,
  });
}

export function useDeleteBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => deleteBundle(bundleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bundleKeys.all });
    },
  });
}

export function usePublicBundles(search?: string) {
  return useQuery({
    queryKey: bundleKeys.public(search),
    queryFn: () => getPublicBundles({ search }),
    staleTime: 60_000,
  });
}

export function useDownloadBundle() {
  return useMutation({
    mutationFn: (bundleId: string) => downloadBundle(bundleId),
  });
}
