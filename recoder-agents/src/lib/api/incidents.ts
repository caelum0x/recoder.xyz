import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface Incident {
  id: string;
  user_id: string;
  agent_id: string;
  agent_name?: string | null;
  run_id?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  root_cause?: string | null;
  resolution?: string | null;
  auto_created: boolean;
  created_at: string;
  resolved_at?: string | null;
}

export interface CreateIncidentData {
  agent_id: string;
  run_id?: string;
  severity?: string;
  title: string;
  description?: string;
}

export interface UpdateIncidentData {
  status?: string;
  root_cause?: string;
  resolution?: string;
  severity?: string;
  title?: string;
  description?: string;
}

export interface IncidentStats {
  open_by_severity: Record<string, number>;
  avg_resolution_hours: number | null;
  most_affected_agents: Array<{
    agent_id: string;
    agent_name: string | null;
    incident_count: number;
  }>;
  total_open: number;
}

export interface IncidentFilters {
  agent_id?: string;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getIncidents = async (filters?: IncidentFilters): Promise<Incident[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString();
  const url = `/incidents${query ? `?${query}` : ''}`;

  const response = await backendApi.get<Incident[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch incidents: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getIncident = async (incidentId: string): Promise<Incident> => {
  const response = await backendApi.get<Incident>(
    `/incidents/${incidentId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch incident: ${response.error.message}`);
  }

  return response.data!;
};

export const createIncident = async (data: CreateIncidentData): Promise<Incident> => {
  const response = await backendApi.post<Incident>(
    '/incidents',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create incident: ${response.error.message}`);
  }

  return response.data!;
};

export const updateIncident = async (
  incidentId: string,
  data: UpdateIncidentData
): Promise<Incident> => {
  const response = await backendApi.patch<Incident>(
    `/incidents/${incidentId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update incident: ${response.error.message}`);
  }

  return response.data!;
};

export const getIncidentStats = async (): Promise<IncidentStats> => {
  const response = await backendApi.get<IncidentStats>(
    '/incidents/stats',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch incident stats: ${response.error.message}`);
  }

  return response.data!;
};
