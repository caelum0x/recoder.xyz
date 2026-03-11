import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEnvVars,
  upsertEnvVar,
  revealEnvVar,
  deleteEnvVar,
  bulkSetEnvVars,
  getEnvVarAudit,
  exportEnvVars,
  type UpsertEnvVarData,
  type BulkEnvVarItem,
} from '@/lib/api/agent-env-vars';

const envVarKeys = {
  all: ['agent-env-vars'] as const,
  list: (agentId: string) => ['agent-env-vars', agentId] as const,
  audit: (agentId: string) => ['agent-env-vars', agentId, 'audit'] as const,
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

export function useSetEnvVar(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertEnvVarData) => upsertEnvVar(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) });
      qc.invalidateQueries({ queryKey: envVarKeys.audit(agentId) });
    },
  });
}

export function useRevealEnvVar(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => revealEnvVar(agentId, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envVarKeys.audit(agentId) });
    },
  });
}

export function useDeleteEnvVar(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteEnvVar(agentId, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) });
      qc.invalidateQueries({ queryKey: envVarKeys.audit(agentId) });
    },
  });
}

export function useBulkSetEnvVars(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variables: BulkEnvVarItem[]) => bulkSetEnvVars(agentId, variables),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envVarKeys.list(agentId) });
      qc.invalidateQueries({ queryKey: envVarKeys.audit(agentId) });
    },
  });
}

export function useEnvVarAudit(agentId: string) {
  return useQuery({
    queryKey: envVarKeys.audit(agentId),
    queryFn: () => getEnvVarAudit(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useExportEnvVars(agentId: string) {
  return useMutation({
    mutationFn: () => exportEnvVars(agentId),
  });
}

// Re-export with spec-compliant names (aliases)
export const useUpsertEnvVar = useSetEnvVar;
