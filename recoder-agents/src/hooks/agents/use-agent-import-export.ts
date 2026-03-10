import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  exportAgent,
  importAgent,
  downloadAgentExport,
  type AgentExportConfig,
  type AgentImportResult,
} from '@/lib/api/agent-import-export';

export function useExportAgent(agentId: string) {
  return useQuery<AgentExportConfig>({
    queryKey: ['agent-export', agentId],
    queryFn: () => exportAgent(agentId),
    enabled: false, // only fetch on demand
    staleTime: 0,
  });
}

export function useExportAgentMutation() {
  return useMutation({
    mutationFn: ({
      agentId,
      options,
    }: {
      agentId: string;
      options?: {
        includeKnowledge?: boolean;
        includeSchedules?: boolean;
        includeQuota?: boolean;
      };
    }) => exportAgent(agentId, options),
  });
}

export function useImportAgent() {
  const qc = useQueryClient();
  return useMutation<
    AgentImportResult,
    Error,
    { config: Record<string, any>; nameOverride?: string }
  >({
    mutationFn: ({ config, nameOverride }) => importAgent(config, nameOverride),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useDownloadAgentExport() {
  return useMutation({
    mutationFn: ({
      agentId,
      agentName,
      options,
    }: {
      agentId: string;
      agentName: string;
      options?: {
        includeKnowledge?: boolean;
        includeSchedules?: boolean;
        includeQuota?: boolean;
      };
    }) =>
      exportAgent(agentId, options).then((config) => {
        const jsonStr = JSON.stringify(config, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = agentName
          .replace(/[^a-zA-Z0-9\s-_]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .toLowerCase();
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `agent-${safeName}-${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return config;
      }),
  });
}
