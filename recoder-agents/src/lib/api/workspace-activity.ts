import { backendApi } from '@/lib/api-client';

export type ActivityType =
  | 'agent_created'
  | 'agent_updated'
  | 'agent_deleted'
  | 'thread_started'
  | 'thread_completed'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'member_joined'
  | 'member_left'
  | 'config_changed'
  | 'deploy_completed';

export interface ActivityEvent {
  id: string;
  user_id: string;
  workspace_id: string | null;
  activity_type: ActivityType;
  actor_name: string | null;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ActivityFilters {
  workspace_id?: string;
  activity_type?: string;
  limit?: number;
  offset?: number;
}

export interface ActivitySummary {
  total_events: number;
  type_counts: Record<string, number>;
  most_active_agents: { name: string; count: number }[];
  busiest_hours: { hour: number; count: number }[];
}

export interface TimelinePoint {
  hour: string;
  count: number;
}

export const getWorkspaceActivity = async (
  filters?: ActivityFilters
): Promise<ActivityEvent[]> => {
  const params = new URLSearchParams();
  if (filters?.workspace_id) params.set('workspace_id', filters.workspace_id);
  if (filters?.activity_type) params.set('activity_type', filters.activity_type);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString();
  const url = `/workspaces/activity${qs ? `?${qs}` : ''}`;

  const response = await backendApi.get<ActivityEvent[]>(url, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivitySummary = async (): Promise<ActivitySummary> => {
  const response = await backendApi.get<ActivitySummary>(
    '/workspaces/activity/summary',
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivityTimeline = async (
  hours: number = 24
): Promise<TimelinePoint[]> => {
  const response = await backendApi.get<TimelinePoint[]>(
    `/workspaces/activity/timeline?hours=${hours}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const recordActivity = async (data: {
  workspace_id?: string;
  activity_type: string;
  actor_name?: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  metadata?: Record<string, any>;
}): Promise<ActivityEvent> => {
  const response = await backendApi.post<ActivityEvent>(
    '/workspaces/activity',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
