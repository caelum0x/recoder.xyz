import { backendApi } from '@/lib/api-client';

export interface ExecutionLog {
  id: string;
  agent_run_id: string;
  agent_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface LogSummary {
  debug: number;
  info: number;
  warn: number;
  error: number;
  total: number;
}

export interface LogFilters {
  level?: string;
  category?: string;
  run_id?: string;
  limit?: number;
  offset?: number;
}

export const getAgentLogs = async (
  agentId: string,
  filters?: LogFilters
): Promise<ExecutionLog[]> => {
  const params = new URLSearchParams();
  if (filters?.level) params.set('level', filters.level);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.run_id) params.set('run_id', filters.run_id);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<ExecutionLog[]>(
    `/agents/${agentId}/logs${query}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRunLogs = async (
  runId: string,
  filters?: { level?: string; category?: string }
): Promise<ExecutionLog[]> => {
  const params = new URLSearchParams();
  if (filters?.level) params.set('level', filters.level);
  if (filters?.category) params.set('category', filters.category);
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<ExecutionLog[]>(
    `/runs/${runId}/logs${query}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLogSummary = async (agentId: string): Promise<LogSummary> => {
  const response = await backendApi.get<LogSummary>(
    `/agents/${agentId}/logs/summary`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
