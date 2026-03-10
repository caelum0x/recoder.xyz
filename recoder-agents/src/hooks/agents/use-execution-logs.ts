import { useQuery } from '@tanstack/react-query';
import {
  getAgentLogs,
  getRunLogs,
  getLogSummary,
  type LogFilters,
} from '@/lib/api/execution-logs';

export function useAgentLogs(agentId: string, filters?: LogFilters) {
  return useQuery({
    queryKey: ['agent-logs', agentId, filters],
    queryFn: () => getAgentLogs(agentId, filters),
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

export function useRunLogs(
  runId: string,
  filters?: { level?: string; category?: string }
) {
  return useQuery({
    queryKey: ['run-logs', runId, filters],
    queryFn: () => getRunLogs(runId, filters),
    enabled: !!runId,
    staleTime: 15_000,
  });
}

export function useLogSummary(agentId: string) {
  return useQuery({
    queryKey: ['log-summary', agentId],
    queryFn: () => getLogSummary(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}
