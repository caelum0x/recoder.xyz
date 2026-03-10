import { backendApi } from '@/lib/api-client';

export interface AgentActivity {
  id: string;
  user_id: string;
  agent_id: string;
  activity_type:
    | 'run_started'
    | 'run_completed'
    | 'run_failed'
    | 'config_updated'
    | 'tool_added'
    | 'tool_removed'
    | 'schedule_triggered'
    | 'secret_updated'
    | 'shared'
    | 'cloned';
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  agent_name?: string;
}

export interface AgentActivityResponse {
  activities: AgentActivity[];
  total: number;
  limit: number;
  offset: number;
}

export interface AgentActivitySummary {
  by_type: Record<string, number>;
  total: number;
  runs: number;
  config_changes: number;
  errors: number;
  period_days: number;
}

export interface ActivityFilters {
  limit?: number;
  offset?: number;
  activity_type?: string;
}

export const getAgentActivity = async (
  agentId: string,
  filters?: ActivityFilters
): Promise<AgentActivityResponse> => {
  const params = new URLSearchParams();
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  if (filters?.activity_type) params.set('activity_type', filters.activity_type);
  const qs = params.toString();
  const response = await backendApi.get<AgentActivityResponse>(
    `/agents/${agentId}/activity${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRecentActivity = async (
  limit: number = 50
): Promise<AgentActivity[]> => {
  const response = await backendApi.get<AgentActivity[]>(
    `/agents/activity/recent?limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentActivitySummary = async (
  agentId: string
): Promise<AgentActivitySummary> => {
  const response = await backendApi.get<AgentActivitySummary>(
    `/agents/${agentId}/activity/summary`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
