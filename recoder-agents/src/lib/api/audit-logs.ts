import { backendApi } from '@/lib/api-client';

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  resource_type?: string;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditSummary {
  by_resource_type: Record<string, number>;
  total: number;
  most_active_resource: string | null;
  most_common_action: string | null;
  period_days: number;
}

export interface AuditExportResponse {
  logs: AuditLog[];
  count: number;
  from_date: string;
  to_date: string;
}

export const getAuditLogs = async (
  filters?: AuditLogFilters
): Promise<AuditLogsResponse> => {
  const params = new URLSearchParams();
  if (filters?.resource_type) params.set('resource_type', filters.resource_type);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<AuditLogsResponse>(
    `/audit/logs${query}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAuditSummary = async (): Promise<AuditSummary> => {
  const response = await backendApi.get<AuditSummary>(
    '/audit/logs/summary',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const exportAuditLogs = async (
  fromDate: string,
  toDate: string
): Promise<AuditExportResponse> => {
  const params = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
  });
  const response = await backendApi.get<AuditExportResponse>(
    `/audit/logs/export?${params}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
