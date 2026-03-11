import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogFilters {
  resource_type?: string;
  action?: string;
  resource_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditSummaryResponse {
  total_events: number;
  days: number;
  events_by_resource: { resource_type: string; count: number }[];
  most_active_hours: { hour: number; count: number }[];
  top_actions: { action: string; count: number }[];
}

export interface AuditTimelineEntry {
  date: string;
  count: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAuditLogs = async (
  filters?: AuditLogFilters
): Promise<AuditLogListResponse> => {
  const params = new URLSearchParams();
  if (filters?.resource_type) params.set('resource_type', filters.resource_type);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.resource_id) params.set('resource_id', filters.resource_id);
  if (filters?.date_from) params.set('date_from', filters.date_from);
  if (filters?.date_to) params.set('date_to', filters.date_to);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<AuditLogListResponse>(
    `/audit/logs${qs}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch audit logs: ${response.error.message}`);
  }

  return response.data!;
};

export const getAuditSummary = async (
  days: number = 7
): Promise<AuditSummaryResponse> => {
  const response = await backendApi.get<AuditSummaryResponse>(
    `/audit/logs/summary?days=${days}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch audit summary: ${response.error.message}`);
  }

  return response.data!;
};

export const exportAuditLogs = async (
  filters?: AuditLogFilters
): Promise<AuditLogEntry[]> => {
  const params = new URLSearchParams();
  if (filters?.resource_type) params.set('resource_type', filters.resource_type);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.resource_id) params.set('resource_id', filters.resource_id);
  if (filters?.date_from) params.set('date_from', filters.date_from);
  if (filters?.date_to) params.set('date_to', filters.date_to);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<AuditLogEntry[]>(
    `/audit/logs/export${qs}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to export audit logs: ${response.error.message}`);
  }

  return response.data!;
};

export const getAuditTimeline = async (
  days: number = 30
): Promise<AuditTimelineEntry[]> => {
  const response = await backendApi.get<AuditTimelineEntry[]>(
    `/audit/logs/timeline?days=${days}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch audit timeline: ${response.error.message}`);
  }

  return response.data!;
};
