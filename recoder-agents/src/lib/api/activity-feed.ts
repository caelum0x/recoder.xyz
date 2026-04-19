import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityEventType =
  | 'agent_created'
  | 'agent_updated'
  | 'agent_deleted'
  | 'thread_started'
  | 'thread_completed'
  | 'deployment_created'
  | 'webhook_triggered'
  | 'error_detected'
  | 'benchmark_run'
  | 'template_used'
  | 'config_changed'
  | 'scheduled_task_run'
  | 'annotation_added';

export interface ActivityEvent {
  id: string;
  user_id: string;
  event_type: ActivityEventType;
  resource_type: string;
  resource_id: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface ActivityFeedFilters {
  event_type?: string;
  resource_type?: string;
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

type ActivityFeedApiResponse =
  | ActivityFeedResponse
  | {
      items?: ActivityEvent[];
      total?: number;
      limit?: number;
      offset?: number;
      has_more?: boolean;
    };

export interface RecordActivityBody {
  event_type: string;
  resource_type: string;
  resource_id?: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityPreferences {
  user_id: string;
  muted_event_types: string[];
  show_read: boolean;
}

export interface UpdatePreferencesBody {
  muted_event_types?: string[];
  show_read?: boolean;
}

export interface ActivityStats {
  unread_count: number;
  events_today: number;
  events_per_type_today: Array<{ event_type: string; count: number }>;
  most_active_hour: number | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const recordActivityEvent = async (
  body: RecordActivityBody
): Promise<ActivityEvent> => {
  const response = await backendApi.post<ActivityEvent>(
    '/activity/events',
    body,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivityFeed = async (
  filters?: ActivityFeedFilters
): Promise<ActivityFeedResponse> => {
  const params = new URLSearchParams();
  if (filters?.event_type) params.set('event_type', filters.event_type);
  if (filters?.resource_type) params.set('resource_type', filters.resource_type);
  if (filters?.unread_only) params.set('unread_only', 'true');
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<ActivityFeedApiResponse>(
    `/activity/feed${query}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);

  const payload = response.data ?? {};
  const events = Array.isArray((payload as ActivityFeedResponse).events)
    ? (payload as ActivityFeedResponse).events
    : Array.isArray((payload as { items?: ActivityEvent[] }).items)
      ? (payload as { items?: ActivityEvent[] }).items!
      : [];

  return {
    events,
    total:
      typeof payload.total === 'number'
        ? payload.total
        : events.length,
    limit:
      typeof payload.limit === 'number'
        ? payload.limit
        : filters?.limit ?? events.length,
    offset:
      typeof payload.offset === 'number'
        ? payload.offset
        : filters?.offset ?? 0,
    has_more:
      typeof payload.has_more === 'boolean'
        ? payload.has_more
        : false,
  };
};

export const markActivityRead = async (
  eventId: string
): Promise<{ id: string; is_read: boolean }> => {
  const response = await backendApi.post<{ id: string; is_read: boolean }>(
    `/activity/events/${eventId}/read`,
    undefined,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const markAllActivitiesRead = async (): Promise<{ success: boolean }> => {
  const response = await backendApi.post<{ success: boolean }>(
    '/activity/events/mark-all-read',
    undefined,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivityPreferences = async (): Promise<ActivityPreferences> => {
  const response = await backendApi.get<ActivityPreferences>(
    '/activity/feed/preferences',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateActivityPreferences = async (
  body: UpdatePreferencesBody
): Promise<ActivityPreferences> => {
  const response = await backendApi.put<ActivityPreferences>(
    '/activity/feed/preferences',
    body,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivityStats = async (): Promise<ActivityStats> => {
  const response = await backendApi.get<ActivityStats>(
    '/activity/feed/stats',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
