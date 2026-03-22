import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface Anomaly {
  id: string;
  user_id: string;
  anomaly_type: 'cost_spike' | 'run_surge' | 'error_spike' | 'latency_spike' | 'token_surge' | 'unusual_hours';
  severity: 'low' | 'medium' | 'high' | 'critical';
  agent_id: string | null;
  agent_name?: string | null;
  description: string;
  current_value: number | null;
  baseline_value: number | null;
  deviation_percent: number | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  detected_at: string;
  resolved_at: string | null;
}

export interface AnomalyFilters {
  status?: string;
  anomaly_type?: string;
  severity?: string;
  agent_id?: string;
  limit?: number;
  offset?: number;
}

export interface AnomalyStats {
  open_by_severity: Record<string, number>;
  total_open: number;
  most_affected_agent: {
    agent_id: string;
    agent_name: string | null;
    anomaly_count: number;
  } | null;
  anomalies_per_day: Array<{
    date: string;
    count: number;
  }>;
}

export interface AnomalyScanResult {
  anomalies_found: number;
  anomalies: Anomaly[];
}

// ============================================================================
// API Functions
// ============================================================================

export const getAnomalies = async (filters?: AnomalyFilters): Promise<Anomaly[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.anomaly_type) params.set('anomaly_type', filters.anomaly_type);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString();
  const url = `/anomalies${query ? `?${query}` : ''}`;

  const response = await backendApi.get<Anomaly[]>(url, {
    showErrors: true,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch anomalies: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const updateAnomalyStatus = async (
  anomalyId: string,
  status: string
): Promise<Anomaly> => {
  const response = await backendApi.patch<Anomaly>(
    `/anomalies/${anomalyId}`,
    { status },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update anomaly: ${response.error.message}`);
  }

  return response.data!;
};

export const runAnomalyScan = async (): Promise<AnomalyScanResult> => {
  const response = await backendApi.post<AnomalyScanResult>(
    '/anomalies/scan',
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to run anomaly scan: ${response.error.message}`);
  }

  return response.data!;
};

export const getAnomalyStats = async (): Promise<AnomalyStats> => {
  const response = await backendApi.get<AnomalyStats>(
    '/anomalies/stats',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch anomaly stats: ${response.error.message}`);
  }

  return response.data!;
};
