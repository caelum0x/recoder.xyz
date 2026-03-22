import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface ActivityItem {
  id: string;
  app: 'agents' | 'agency' | 'pm' | 'web';
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  total: number;
  has_more: boolean;
}

export interface PlatformStats {
  agent_count: number;
  threads_7d: number;
  workflow_count: number;
  runs_today: number;
}

export async function getActivityFeed(params?: {
  limit?: number;
  offset?: number;
  app_filter?: string;
  q?: string;
  date_range?: 'today' | 'week' | 'month' | 'all';
}): Promise<ActivityFeedResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.app_filter) searchParams.set('app_filter', params.app_filter);
    if (params?.q) searchParams.set('q', params.q);
    if (params?.date_range) searchParams.set('date_range', params.date_range);
    const qs = searchParams.toString();
    const response = await backendApi.get<ActivityFeedResponse>(
      `/activity/feed${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get activity feed', resource: 'platform' });
    throw error;
  }
}

export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const response = await backendApi.get<PlatformStats>('/platform/stats', {
      showErrors: true,
    });
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get platform stats', resource: 'platform' });
    throw error;
  }
}
