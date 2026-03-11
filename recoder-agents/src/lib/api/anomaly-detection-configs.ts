import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface AnomalyDetectionConfig {
  id: string;
  user_id: string;
  metric_type: string;
  agent_id: string | null;
  detection_method: 'zscore' | 'iqr' | 'threshold' | 'percentage_change';
  sensitivity: number;
  window_hours: number;
  is_active: boolean;
  created_at: string;
}

export interface DetectedAnomaly {
  id: string;
  user_id: string;
  config_id: string | null;
  agent_id: string | null;
  metric_type: string;
  observed_value: number | null;
  expected_value: number | null;
  deviation_score: number | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  description: string | null;
  detected_at: string;
}

export interface AnomalyDetectionStats {
  total_open: number;
  open_by_severity: Record<string, number>;
  by_metric_type: Record<string, number>;
  resolved_count: number;
}

export interface AnomalyScanResult {
  new_anomalies: number;
  configs_scanned: number;
}

export interface CreateAnomalyConfigData {
  metric_type: string;
  agent_id?: string | null;
  detection_method?: 'zscore' | 'iqr' | 'threshold' | 'percentage_change';
  sensitivity?: number;
  window_hours?: number;
  is_active?: boolean;
}

export interface UpdateAnomalyConfigData {
  metric_type?: string;
  agent_id?: string | null;
  detection_method?: 'zscore' | 'iqr' | 'threshold' | 'percentage_change';
  sensitivity?: number;
  window_hours?: number;
  is_active?: boolean;
}

export interface DetectedAnomalyFilters {
  status?: string;
  severity?: string;
  agent_id?: string;
  limit?: number;
}

// ============================================================================
// Config API Functions
// ============================================================================

export const createAnomalyConfig = async (
  data: CreateAnomalyConfigData
): Promise<AnomalyDetectionConfig> => {
  const response = await backendApi.post<AnomalyDetectionConfig>('/anomaly/configs', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAnomalyConfigs = async (): Promise<AnomalyDetectionConfig[]> => {
  const response = await backendApi.get<AnomalyDetectionConfig[]>('/anomaly/configs', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
};

export const updateAnomalyConfig = async (
  configId: string,
  data: UpdateAnomalyConfigData
): Promise<AnomalyDetectionConfig> => {
  const response = await backendApi.patch<AnomalyDetectionConfig>(
    `/anomaly/configs/${configId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAnomalyConfig = async (configId: string): Promise<void> => {
  const response = await backendApi.delete(`/anomaly/configs/${configId}`);
  if (response.error) throw new Error(response.error.message);
};

// ============================================================================
// Scan API Function
// ============================================================================

export const runAnomalyConfigScan = async (): Promise<AnomalyScanResult> => {
  const response = await backendApi.post<AnomalyScanResult>('/anomaly/scan', {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Detected Anomalies API Functions
// ============================================================================

export const getDetectedAnomalies = async (
  filters?: DetectedAnomalyFilters
): Promise<DetectedAnomaly[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const response = await backendApi.get<DetectedAnomaly[]>(
    `/anomaly/detected${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
};

export const updateDetectedAnomalyStatus = async (
  anomalyId: string,
  status: string
): Promise<DetectedAnomaly> => {
  const response = await backendApi.patch<DetectedAnomaly>(
    `/anomaly/detected/${anomalyId}`,
    { status }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAnomalyDetectionStats = async (): Promise<AnomalyDetectionStats> => {
  const response = await backendApi.get<AnomalyDetectionStats>('/anomaly/stats', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
