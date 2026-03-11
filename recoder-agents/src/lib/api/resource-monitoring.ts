import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceSnapshot {
  id: string;
  user_id: string;
  agent_id: string | null;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  disk_mb: number;
  network_in_kb: number;
  network_out_kb: number;
  active_connections: number;
  recorded_at: string;
}

export interface ResourceHistoryBucket {
  bucket: string;
  avg_cpu: number;
  avg_memory: number;
  avg_disk: number;
  avg_network_in: number;
  avg_network_out: number;
  avg_connections: number;
}

export interface ResourceAlertRule {
  id: string;
  user_id: string;
  agent_id: string | null;
  metric: 'cpu_percent' | 'memory_percent' | 'disk_mb' | 'active_connections';
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq';
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  created_at: string;
}

export interface RecordSnapshotData {
  agent_id?: string;
  cpu_percent?: number;
  memory_mb?: number;
  memory_percent?: number;
  disk_mb?: number;
  network_in_kb?: number;
  network_out_kb?: number;
  active_connections?: number;
}

export interface CreateAlertRuleData {
  agent_id?: string;
  metric: ResourceAlertRule['metric'];
  threshold: number;
  comparison?: ResourceAlertRule['comparison'];
  cooldown_minutes?: number;
}

export interface UpdateAlertRuleData {
  metric?: ResourceAlertRule['metric'];
  threshold?: number;
  comparison?: ResourceAlertRule['comparison'];
  is_active?: boolean;
  cooldown_minutes?: number;
}

export interface SnapshotFilters {
  agent_id?: string;
  minutes?: number;
  limit?: number;
}

export interface AlertCheckResult {
  rule_id: string;
  agent_id: string | null;
  metric: string;
  threshold: number;
  comparison: string;
  current_value: number;
  triggered: boolean;
}

export interface CheckAlertsResponse {
  triggered: AlertCheckResult[];
  checked: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const recordSnapshot = async (
  data: RecordSnapshotData
): Promise<ResourceSnapshot> => {
  const response = await backendApi.post<ResourceSnapshot>('/resources/snapshot', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getResourceSnapshots = async (
  filters?: SnapshotFilters
): Promise<ResourceSnapshot[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.minutes) params.set('minutes', String(filters.minutes));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<ResourceSnapshot[]>(
    `/resources/snapshots${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCurrentResources = async (): Promise<ResourceSnapshot[]> => {
  const response = await backendApi.get<ResourceSnapshot[]>('/resources/current', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getResourceHistory = async (
  agentId?: string,
  minutes?: number,
  intervalMinutes?: number
): Promise<ResourceHistoryBucket[]> => {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  if (minutes) params.set('minutes', String(minutes));
  if (intervalMinutes) params.set('interval_minutes', String(intervalMinutes));
  const qs = params.toString();
  const response = await backendApi.get<ResourceHistoryBucket[]>(
    `/resources/history${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createAlertRule = async (
  data: CreateAlertRuleData
): Promise<ResourceAlertRule> => {
  const response = await backendApi.post<ResourceAlertRule>('/resources/alert-rules', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAlertRules = async (): Promise<ResourceAlertRule[]> => {
  const response = await backendApi.get<ResourceAlertRule[]>('/resources/alert-rules', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAlertRule = async (
  ruleId: string,
  data: UpdateAlertRuleData
): Promise<ResourceAlertRule> => {
  const response = await backendApi.patch<ResourceAlertRule>(
    `/resources/alert-rules/${ruleId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAlertRule = async (ruleId: string): Promise<void> => {
  const response = await backendApi.delete(`/resources/alert-rules/${ruleId}`);
  if (response.error) throw new Error(response.error.message);
};

export const checkAlerts = async (): Promise<CheckAlertsResponse> => {
  const response = await backendApi.post<CheckAlertsResponse>('/resources/check-alerts');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
