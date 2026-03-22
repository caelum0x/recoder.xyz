import { backendApi } from '@/lib/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface AuditEvent {
  id: string;
  user_id: string;
  agent_id: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  actor: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditRetentionPolicy {
  id?: string;
  user_id?: string;
  retention_days: number;
  export_before_delete: boolean;
  created_at?: string;
}

export interface LogEventData {
  agent_id?: string;
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  action: string;
  actor?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditFilters {
  agent_id?: string;
  event_type?: string;
  resource_type?: string;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  total_events: number;
  by_event_type: Record<string, number>;
  by_agent: Record<string, number>;
  by_action: Record<string, number>;
  events_per_day: Array<{ date: string; count: number }>;
}

// ============================================================================
// API Functions
// ============================================================================

export const logEvent = async (data: LogEventData): Promise<AuditEvent> => {
  const response = await backendApi.post<AuditEvent>('/audit/events', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const batchLogEvents = async (
  events: LogEventData[]
): Promise<{ inserted: number; events: AuditEvent[] }> => {
  const response = await backendApi.post<{ inserted: number; events: AuditEvent[] }>(
    '/audit/events/batch',
    { events }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listAuditEvents = async (filters?: AuditFilters): Promise<AuditEvent[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.event_type) params.set('event_type', filters.event_type);
  if (filters?.resource_type) params.set('resource_type', filters.resource_type);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  const response = await backendApi.get<AuditEvent[]>(
    `/audit/events${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAuditEvent = async (id: string): Promise<AuditEvent> => {
  const response = await backendApi.get<AuditEvent>(`/audit/events/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAuditStats = async (): Promise<AuditStats> => {
  const response = await backendApi.get<AuditStats>('/audit/events/stats', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRetentionPolicy = async (): Promise<AuditRetentionPolicy> => {
  const response = await backendApi.get<AuditRetentionPolicy>('/audit/retention', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateRetentionPolicy = async (data: {
  retention_days: number;
  export_before_delete?: boolean;
}): Promise<AuditRetentionPolicy> => {
  const response = await backendApi.put<AuditRetentionPolicy>('/audit/retention', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cleanupOldEvents = async (): Promise<{ deleted_count: number }> => {
  const response = await backendApi.delete<{ deleted_count: number }>('/audit/events/cleanup');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
