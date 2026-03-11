'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRunLogs,
  getRunLogSummary,
  searchLogs,
  getErrorFrequency,
  createRunLog,
  type RunLogEntry,
  type RunLogSummary,
  type RunLogFilters,
  type LogSearchParams,
  type ErrorFrequencyEntry,
  type CreateLogEntryRequest,
} from '@/lib/api/agent-run-logs';

export const runLogKeys = {
  all: ['run-logs'] as const,
  logs: (runId: string, filters?: RunLogFilters) => [...runLogKeys.all, 'logs', runId, filters] as const,
  summary: (runId: string) => [...runLogKeys.all, 'summary', runId] as const,
  search: (params?: LogSearchParams) => [...runLogKeys.all, 'search', params] as const,
  errorFrequency: (agentId?: string, days?: number) => [...runLogKeys.all, 'error-frequency', agentId, days] as const,
};

export function useRunLogs(runId: string, filters?: RunLogFilters) {
  return useQuery<RunLogEntry[]>({
    queryKey: runLogKeys.logs(runId, filters),
    queryFn: () => getRunLogs(runId, filters),
    enabled: !!runId,
    staleTime: 10_000,
  });
}

export function useRunLogSummary(runId: string) {
  return useQuery<RunLogSummary>({
    queryKey: runLogKeys.summary(runId),
    queryFn: () => getRunLogSummary(runId),
    enabled: !!runId,
    staleTime: 10_000,
  });
}

export function useSearchLogs(params: LogSearchParams) {
  return useQuery<RunLogEntry[]>({
    queryKey: runLogKeys.search(params),
    queryFn: () => searchLogs(params),
    enabled: !!(params.search || params.agent_id),
    staleTime: 15_000,
  });
}

export function useErrorFrequency(agentId?: string, days?: number) {
  return useQuery<ErrorFrequencyEntry[]>({
    queryKey: runLogKeys.errorFrequency(agentId, days),
    queryFn: () => getErrorFrequency(agentId, days),
    staleTime: 30_000,
  });
}

export function useCreateRunLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, entry }: { runId: string; entry: CreateLogEntryRequest }) =>
      createRunLog(runId, entry),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: runLogKeys.logs(variables.runId) });
      queryClient.invalidateQueries({ queryKey: runLogKeys.summary(variables.runId) });
    },
  });
}
