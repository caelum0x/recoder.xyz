import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricDefinition {
  id: string;
  user_id: string;
  metric_name: string;
  display_name: string;
  description: string | null;
  unit: string;
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'last';
  chart_type: 'line' | 'bar' | 'area' | 'gauge' | 'number';
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface MetricValue {
  id: string;
  metric_id: string;
  user_id: string;
  value: number;
  dimensions: Record<string, unknown>;
  recorded_at: string;
}

export interface MetricAggregate {
  metric_id: string;
  metric_name: string;
  display_name: string;
  unit: string;
  count: number;
  latest: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  sum: number | null;
  trend: 'up' | 'down' | 'flat';
}

export interface MetricDashboardItem extends MetricDefinition {
  latest_value: number | null;
  latest_recorded_at: string | null;
  values_last_24h: number;
}

export interface CreateMetricDefData {
  metric_name: string;
  display_name: string;
  description?: string;
  unit?: string;
  aggregation?: MetricDefinition['aggregation'];
  chart_type?: MetricDefinition['chart_type'];
  color?: string;
}

export interface UpdateMetricDefData {
  display_name?: string;
  description?: string;
  unit?: string;
  aggregation?: MetricDefinition['aggregation'];
  chart_type?: MetricDefinition['chart_type'];
  color?: string;
  is_active?: boolean;
}

export interface RecordValueData {
  value: number;
  dimensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const createMetricDefinition = async (
  data: CreateMetricDefData
): Promise<MetricDefinition> => {
  const response = await backendApi.post<MetricDefinition>('/custom-metrics/definitions', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMetricDefinitions = async (): Promise<MetricDefinition[]> => {
  const response = await backendApi.get<MetricDefinition[]>('/custom-metrics/definitions', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateMetricDefinition = async (
  metricId: string,
  data: UpdateMetricDefData
): Promise<MetricDefinition> => {
  const response = await backendApi.patch<MetricDefinition>(
    `/custom-metrics/definitions/${metricId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteMetricDefinition = async (metricId: string): Promise<void> => {
  const response = await backendApi.delete(`/custom-metrics/definitions/${metricId}`);
  if (response.error) throw new Error(response.error.message);
};

export const recordMetricValue = async (
  metricId: string,
  data: RecordValueData
): Promise<MetricValue> => {
  const response = await backendApi.post<MetricValue>(
    `/custom-metrics/${metricId}/record`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMetricValues = async (
  metricId: string,
  hours?: number,
  limit?: number
): Promise<MetricValue[]> => {
  const params = new URLSearchParams();
  if (hours) params.set('hours', String(hours));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const response = await backendApi.get<MetricValue[]>(
    `/custom-metrics/${metricId}/values${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMetricAggregate = async (
  metricId: string,
  hours?: number
): Promise<MetricAggregate> => {
  const params = new URLSearchParams();
  if (hours) params.set('hours', String(hours));
  const qs = params.toString();
  const response = await backendApi.get<MetricAggregate>(
    `/custom-metrics/${metricId}/aggregate${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMetricsDashboard = async (): Promise<MetricDashboardItem[]> => {
  const response = await backendApi.get<MetricDashboardItem[]>('/custom-metrics/dashboard', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
