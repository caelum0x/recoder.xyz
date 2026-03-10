import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEnvVars,
  upsertEnvVar,
  deleteEnvVar,
  bulkSetEnvVars,
  exportEnvVars,
  type UpsertEnvVarData,
  type BulkEnvVarItem,
} from '@/lib/api/agent-env-vars';

const envVarKeys = {
  all: ['agent-env-vars'] as const,
  list: (agentId: string) => ['agent-env-vars', agentId] as const,
  export: (agentId: string) => ['agent-env-vars', agentId, 'export'] as const,
};

export function useAgentEnvVars(agentId: string) {
  return useQuery({
    queryKey: envVarKeys.list(agentId),
    queryFn: () => listEnvVars(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useUpsertEnvVar(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertEnvVarData) => upsertEnvVar(agentId, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) }),
  });
}

export function useDeleteEnvVar(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteEnvVar(agentId, key),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) }),
  });
}

export function useBulkSetEnvVars(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variables: BulkEnvVarItem[]) => bulkSetEnvVars(agentId, variables),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) }),
  });
}

export function useExportEnvVars(agentId: string) {
  return useMutation({
    mutationFn: () => exportEnvVars(agentId),
  });
}
