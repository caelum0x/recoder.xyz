import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface SlaDefinition {
  id: string;
  user_id: string;
  name: string;
  agent_id: string | null;
  metric_type: 'response_time' | 'uptime' | 'error_rate' | 'throughput' | 'resolution_time';
  target_value: number;
  target_unit: string;
  evaluation_window: string;
  is_active: boolean;
  created_at: string;
  compliance_rate: number | null;
  total_measurements: number;
  breach_count: number;
}

export interface CreateSlaData {
  name: string;
  agent_id?: string;
  metric_type: string;
  target_value: number;
  target_unit?: string;
  evaluation_window?: string;
}

export interface UpdateSlaData {
  name?: string;
  agent_id?: string;
  metric_type?: string;
  target_value?: number;
  target_unit?: string;
  evaluation_window?: string;
  is_active?: boolean;
}

export interface SlaMeasurement {
  id: string;
  sla_id: string;
  user_id: string;
  measured_value: number;
  is_breach: boolean;
  period_start: string;
  period_end: string;
  measured_at: string;
}

export interface MeasureResult {
  success: boolean;
  measured: number;
  breaches: number;
  measurements: Array<{
    sla_id: string;
    sla_name: string;
    metric_type: string;
    measured_value: number;
    target_value: number;
    is_breach: boolean;
  }>;
}

export interface SlaDashboard {
  overall_compliance_pct: number;
  total_slas: number;
  active_slas: number;
  total_measurements: number;
  total_breaches: number;
  per_sla_compliance: Array<{
    id: string;
    name: string;
    metric_type: string;
    target_value: number;
    target_unit: string;
    agent_id: string | null;
    total_measurements: number;
    breach_count: number;
    compliance_rate: number | null;
  }>;
  recent_breaches: Array<{
    id: string;
    sla_id: string;
    sla_name: string;
    metric_type: string;
    measured_value: number;
    target_value: number;
    target_unit: string;
    measured_at: string;
  }>;
  worst_performing: {
    id: string;
    name: string;
    compliance_rate: number;
  } | null;
}

export interface MeasurementFilters {
  breach_only?: boolean;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getSlaDefinitions = async (): Promise<SlaDefinition[]> => {
  const response = await backendApi.get<SlaDefinition[]>(
    '/sla/definitions',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch SLA definitions: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const createSlaDefinition = async (data: CreateSlaData): Promise<SlaDefinition> => {
  const response = await backendApi.post<SlaDefinition>(
    '/sla/definitions',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create SLA definition: ${response.error.message}`);
  }

  return response.data!;
};

export const updateSlaDefinition = async (
  slaId: string,
  data: UpdateSlaData
): Promise<SlaDefinition> => {
  const response = await backendApi.patch<SlaDefinition>(
    `/sla/definitions/${slaId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update SLA definition: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteSlaDefinition = async (
  slaId: string
): Promise<{ success: boolean }> => {
  const response = await backendApi.delete<{ success: boolean }>(
    `/sla/definitions/${slaId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete SLA definition: ${response.error.message}`);
  }

  return response.data!;
};

export const measureSla = async (): Promise<MeasureResult> => {
  const response = await backendApi.post<MeasureResult>(
    '/sla/measure',
    undefined,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to measure SLAs: ${response.error.message}`);
  }

  return response.data!;
};

export const getSlaMeasurements = async (
  slaId: string,
  filters?: MeasurementFilters
): Promise<SlaMeasurement[]> => {
  const params = new URLSearchParams();
  if (filters?.breach_only) params.set('breach_only', 'true');
  if (filters?.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  const url = `/sla/${slaId}/measurements${query ? `?${query}` : ''}`;

  const response = await backendApi.get<SlaMeasurement[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch SLA measurements: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getSlaDashboard = async (): Promise<SlaDashboard> => {
  const response = await backendApi.get<SlaDashboard>(
    '/sla/dashboard',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch SLA dashboard: ${response.error.message}`);
  }

  return response.data!;
};
