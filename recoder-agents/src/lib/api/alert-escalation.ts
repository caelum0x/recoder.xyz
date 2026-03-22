import { backendApi } from '@/lib/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface EscalationPolicy {
  id: string;
  user_id: string;
  policy_name: string;
  description: string | null;
  escalation_steps: EscalationStep[];
  repeat_interval_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface EscalationStep {
  step: number;
  action: string;
  notify_after_minutes: number;
  [key: string]: unknown;
}

export interface EscalationIncident {
  id: string;
  user_id: string;
  policy_id: string | null;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  current_step: number;
  status: 'open' | 'acknowledged' | 'escalated' | 'resolved' | 'closed';
  source: string | null;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  actions?: EscalationAction[];
}

export interface EscalationAction {
  id: string;
  incident_id: string;
  user_id: string;
  action_type: 'notify' | 'acknowledge' | 'escalate' | 'resolve' | 'comment';
  step_index: number;
  notes: string | null;
  performed_at: string;
}

export interface CreatePolicyData {
  policy_name: string;
  description?: string;
  escalation_steps: EscalationStep[];
  repeat_interval_minutes?: number;
  is_active?: boolean;
}

export interface UpdatePolicyData {
  policy_name?: string;
  description?: string;
  escalation_steps?: EscalationStep[];
  repeat_interval_minutes?: number;
  is_active?: boolean;
}

export interface CreateIncidentData {
  title: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  policy_id?: string;
  source?: string;
  details?: Record<string, unknown>;
}

export interface IncidentFilters {
  status?: string;
  severity?: string;
  limit?: number;
}

export interface EscalationStats {
  open_count: number;
  by_severity: Record<string, number>;
  avg_resolution_minutes: number | null;
  escalation_rate: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const listPolicies = async (): Promise<EscalationPolicy[]> => {
  const response = await backendApi.get<EscalationPolicy[]>('/escalation/policies', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createPolicy = async (data: CreatePolicyData): Promise<EscalationPolicy> => {
  const response = await backendApi.post<EscalationPolicy>('/escalation/policies', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePolicy = async (
  id: string,
  data: UpdatePolicyData
): Promise<EscalationPolicy> => {
  const response = await backendApi.patch<EscalationPolicy>(`/escalation/policies/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePolicy = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/escalation/policies/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const createIncident = async (data: CreateIncidentData): Promise<EscalationIncident> => {
  const response = await backendApi.post<EscalationIncident>('/escalation/incidents', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listIncidents = async (filters?: IncidentFilters): Promise<EscalationIncident[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<EscalationIncident[]>(
    `/escalation/incidents${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getIncident = async (id: string): Promise<EscalationIncident> => {
  const response = await backendApi.get<EscalationIncident>(`/escalation/incidents/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const acknowledgeIncident = async (id: string): Promise<EscalationIncident> => {
  const response = await backendApi.post<EscalationIncident>(
    `/escalation/incidents/${id}/acknowledge`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const escalateIncident = async (
  id: string,
  notes?: string
): Promise<EscalationIncident> => {
  const response = await backendApi.post<EscalationIncident>(
    `/escalation/incidents/${id}/escalate`,
    { notes }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const resolveIncident = async (
  id: string,
  notes?: string
): Promise<EscalationIncident> => {
  const response = await backendApi.post<EscalationIncident>(
    `/escalation/incidents/${id}/resolve`,
    { notes }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getEscalationStats = async (): Promise<EscalationStats> => {
  const response = await backendApi.get<EscalationStats>('/escalation/stats', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
