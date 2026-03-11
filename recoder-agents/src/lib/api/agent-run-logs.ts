import { backendApi } from '@/lib/api-client';

export interface RunLogEntry {
  id: string;
  run_id: string;
  agent_id: string;
  log_level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  context: Record<string, unknown>;
  step_index: number | null;
  tool_name: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface RunLogSummary {
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
  total_duration_ms: number;
  top_errors: Array<{ message: string; count: number }>;
}

export interface RunLogFilters {
  log_level?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LogSearchParams {
  search?: string;
  agent_id?: string;
  log_level?: string;
  days?: number;
  limit?: number;
}

export interface ErrorFrequencyEntry {
  message: string;
  count: number;
  last_seen: string;
}

export interface CreateLogEntryRequest {
  log_level?: string;
  message: string;
  context?: Record<string, unknown>;
  step_index?: number;
  tool_name?: string;
  duration_ms?: number;
}

export const getRunLogs = async (
  runId: string,
  filters?: RunLogFilters
): Promise<RunLogEntry[]> => {
  const params = new URLSearchParams();
  if (filters?.log_level && filters.log_level !== 'all') params.set('log_level', filters.log_level);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<RunLogEntry[]>(
    `/runs/${runId}/logs${query}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch run logs');
  return response.data!;
};

export const createRunLog = async (
  runId: string,
  entry: CreateLogEntryRequest
): Promise<{ id: string; run_id: string; agent_id: string; created_at: string }> => {
  const response = await backendApi.post<{ id: string; run_id: string; agent_id: string; created_at: string }>(
    `/runs/${runId}/logs`,
    entry,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to create log entry');
  return response.data!;
};

export const getRunLogSummary = async (runId: string): Promise<RunLogSummary> => {
  const response = await backendApi.get<RunLogSummary>(
    `/runs/${runId}/logs/summary`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch log summary');
  return response.data!;
};

export const searchLogs = async (params: LogSearchParams): Promise<RunLogEntry[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.agent_id) searchParams.set('agent_id', params.agent_id);
  if (params.log_level && params.log_level !== 'all') searchParams.set('log_level', params.log_level);
  if (params.days) searchParams.set('days', String(params.days));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString() ? `?${searchParams}` : '';
  const response = await backendApi.get<RunLogEntry[]>(
    `/logs/search${query}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to search logs');
  return response.data!;
};

export const getErrorFrequency = async (
  agentId?: string,
  days?: number
): Promise<ErrorFrequencyEntry[]> => {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  if (days) params.set('days', String(days));
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<ErrorFrequencyEntry[]>(
    `/logs/error-frequency${query}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message || 'Failed to fetch error frequency');
  return response.data!;
};
