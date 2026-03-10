import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  user_id: string;
  credential_key: string;
  agent_id: string | null;
  access_type: 'read' | 'create' | 'update' | 'delete' | 'use_in_run';
  ip_address: string | null;
  success: boolean;
  created_at: string;
}

export interface AuditSummary {
  total_accesses: number;
  unique_keys: number;
  failed_count: number;
  most_accessed_keys: Array<{ credential_key: string; access_count: number }>;
  most_active_agents: Array<{ agent_id: string; access_count: number }>;
  access_by_type: Array<{ access_type: string; count: number }>;
}

export interface AnomalyEntry {
  anomaly_type: 'high_frequency' | 'repeated_failures' | 'odd_hours';
  description: string;
  credential_key: string | null;
  agent_id: string | null;
  count: number;
  last_seen: string | null;
}

export interface AuditLogFilters {
  credential_key?: string;
  agent_id?: string;
  access_type?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getCredentialAuditLog = async (
  filters: AuditLogFilters = {}
): Promise<AuditLogEntry[]> => {
  const params = new URLSearchParams();
  if (filters.credential_key) params.append('credential_key', filters.credential_key);
  if (filters.agent_id) params.append('agent_id', filters.agent_id);
  if (filters.access_type) params.append('access_type', filters.access_type);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const query = params.toString();
  const url = `/credentials/audit-log${query ? `?${query}` : ''}`;

  const response = await backendApi.get<AuditLogEntry[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch audit log: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getCredentialAuditSummary = async (): Promise<AuditSummary> => {
  const response = await backendApi.get<AuditSummary>(
    '/credentials/audit-log/summary',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch audit summary: ${response.error.message}`);
  }

  return response.data!;
};

export const getCredentialAnomalies = async (): Promise<AnomalyEntry[]> => {
  const response = await backendApi.get<AnomalyEntry[]>(
    '/credentials/audit-log/anomalies',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch anomalies: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const recordCredentialAccess = async (data: {
  credential_key: string;
  agent_id?: string;
  access_type: string;
  ip_address?: string;
  success?: boolean;
}): Promise<{ success: boolean; id?: string; created_at?: string }> => {
  const response = await backendApi.post<{
    success: boolean;
    id?: string;
    created_at?: string;
  }>('/credentials/audit-log', data, { showErrors: false });

  if (response.error) {
    throw new Error(`Failed to record access: ${response.error.message}`);
  }

  return response.data!;
};
