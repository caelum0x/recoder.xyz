import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CapacityMetric {
  id: string;
  user_id: string;
  metric_name: string;
  current_value: number;
  max_capacity: number | null;
  unit: string;
  recorded_at: string;
}

export interface CapacityPlan {
  id: string;
  user_id: string;
  plan_name: string;
  description: string | null;
  target_date: string | null;
  metric_projections: Record<string, unknown>[];
  growth_assumptions: Record<string, unknown>;
  recommendations: string[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface CapacityAlert {
  id: string;
  user_id: string;
  metric_name: string;
  threshold_pct: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  usage_pct: number | null;
  current_value: number | null;
}

export interface RecordMetricData {
  metric_name: string;
  current_value: number;
  max_capacity?: number;
  unit?: string;
}

export interface CreatePlanData {
  plan_name: string;
  description?: string;
  target_date?: string;
  metric_projections?: Record<string, unknown>[];
  growth_assumptions?: Record<string, unknown>;
  recommendations?: string[];
}

export interface UpdatePlanData {
  plan_name?: string;
  description?: string;
  target_date?: string;
  metric_projections?: Record<string, unknown>[];
  growth_assumptions?: Record<string, unknown>;
  recommendations?: string[];
  status?: 'draft' | 'active' | 'completed' | 'archived';
}

export interface SetAlertData {
  metric_name: string;
  threshold_pct?: number;
  is_active?: boolean;
}

export interface CapacityCheckResult {
  triggered: { metric_name: string; usage_pct: number; threshold_pct: number }[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const recordMetric = async (data: RecordMetricData): Promise<CapacityMetric> => {
  const response = await backendApi.post<CapacityMetric>('/capacity/metrics', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listCurrentMetrics = async (): Promise<CapacityMetric[]> => {
  const response = await backendApi.get<CapacityMetric[]>('/capacity/metrics', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMetricHistory = async (
  metricName: string,
  days: number = 30
): Promise<CapacityMetric[]> => {
  const response = await backendApi.get<CapacityMetric[]>(
    `/capacity/metrics/${encodeURIComponent(metricName)}/history?days=${days}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listPlans = async (): Promise<CapacityPlan[]> => {
  const response = await backendApi.get<CapacityPlan[]>('/capacity/plans', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createPlan = async (data: CreatePlanData): Promise<CapacityPlan> => {
  const response = await backendApi.post<CapacityPlan>('/capacity/plans', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPlan = async (id: string): Promise<CapacityPlan> => {
  const response = await backendApi.get<CapacityPlan>(`/capacity/plans/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePlan = async (id: string, data: UpdatePlanData): Promise<CapacityPlan> => {
  const response = await backendApi.patch<CapacityPlan>(`/capacity/plans/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePlan = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/capacity/plans/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const setCapacityAlert = async (data: SetAlertData): Promise<CapacityAlert> => {
  const response = await backendApi.post<CapacityAlert>('/capacity/alerts', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listCapacityAlerts = async (): Promise<CapacityAlert[]> => {
  const response = await backendApi.get<CapacityAlert[]>('/capacity/alerts', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const checkCapacity = async (): Promise<CapacityCheckResult> => {
  const response = await backendApi.post<CapacityCheckResult>('/capacity/check', {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
