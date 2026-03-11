import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface AggregatedLog {
  id: string;
  user_id: string;
  agent_id: string | null;
  log_level: LogLevel;
  source: string;
  message: string;
  details: Record<string, unknown>;
  trace_id: string | null;
  span_id: string | null;
  tags: string[];
  created_at: string;
}

export interface LogSavedFilter {
  id: string;
  user_id: string;
  filter_name: string;
  filter_config: LogFilterConfig;
  created_at: string;
}

export interface LogFilterConfig {
  agent_id?: string;
  log_level?: string;
  source?: string;
  search?: string;
  trace_id?: string;
  tags?: string;
  from_time?: string;
  to_time?: string;
}

export interface LogStats {
  total_logs: number;
  by_level: Array<{ log_level: string; count: number }>;
  by_agent: Array<{ agent_id: string; count: number }>;
  by_source: Array<{ source: string; count: number }>;
  top_tags: Array<{ tag: string; count: number }>;
  hourly_volume: Array<{ hour: string; count: number }>;
}

export interface IngestLogData {
  agent_id?: string;
  log_level?: LogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  trace_id?: string;
  span_id?: string;
  tags?: string[];
}

export interface BatchIngestData {
  logs: IngestLogData[];
}

export interface CreateSavedFilterData {
  filter_name: string;
  filter_config: LogFilterConfig;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const ingestLog = async (data: IngestLogData): Promise<AggregatedLog> => {
  const response = await backendApi.post<AggregatedLog>('/logs', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const ingestLogBatch = async (
  data: BatchIngestData
): Promise<{ inserted: number; errors: string[] }> => {
  const response = await backendApi.post<{ inserted: number; errors: string[] }>(
    '/logs/batch',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAggregatedLogs = async (
  filters?: LogFilterConfig & { limit?: number; offset?: number }
): Promise<AggregatedLog[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.log_level) params.set('log_level', filters.log_level);
  if (filters?.source) params.set('source', filters.source);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.trace_id) params.set('trace_id', filters.trace_id);
  if (filters?.tags) params.set('tags', filters.tags);
  if (filters?.from_time) params.set('from_time', filters.from_time);
  if (filters?.to_time) params.set('to_time', filters.to_time);
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  if (filters?.offset != null) params.set('offset', String(filters.offset));
  const qs = params.toString();
  const response = await backendApi.get<AggregatedLog[]>(`/logs${qs ? `?${qs}` : ''}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLogStats = async (): Promise<LogStats> => {
  const response = await backendApi.get<LogStats>('/logs/stats', { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTraceLogs = async (traceId: string): Promise<AggregatedLog[]> => {
  const response = await backendApi.get<AggregatedLog[]>(`/logs/trace/${traceId}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteOldLogs = async (days: number): Promise<{ deleted: boolean; days: number }> => {
  const response = await backendApi.delete(`/logs?days=${days}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean; days: number };
};

export const createSavedFilter = async (
  data: CreateSavedFilterData
): Promise<LogSavedFilter> => {
  const response = await backendApi.post<LogSavedFilter>('/logs/saved-filters', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSavedFilters = async (): Promise<LogSavedFilter[]> => {
  const response = await backendApi.get<LogSavedFilter[]>('/logs/saved-filters', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteSavedFilter = async (filterId: string): Promise<void> => {
  const response = await backendApi.delete(`/logs/saved-filters/${filterId}`);
  if (response.error) throw new Error(response.error.message);
};
