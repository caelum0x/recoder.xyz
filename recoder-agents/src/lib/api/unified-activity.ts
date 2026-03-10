import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface TimelineItem {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string | null;
  resource_id: string | null;
  resource_type: string | null;
  resource_name: string | null;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface TimelineResponse {
  items: TimelineItem[];
  total: number;
  has_more: boolean;
}

export interface DailyActivityStat {
  date: string;
  count: number;
  breakdown: Record<string, number>;
}

export interface ActivityStatsResponse {
  events_today: number;
  events_this_week: number;
  most_active_resource: string | null;
  peak_hour: number | null;
  daily_stats: DailyActivityStat[];
}

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface HeatmapResponse {
  cells: HeatmapCell[];
  total_events: number;
  period_days: number;
}

// ============================================================================
// Filter types
// ============================================================================

export interface TimelineFilters {
  limit?: number;
  offset?: number;
  resource_type?: string;
  from_date?: string;
  to_date?: string;
}

// ============================================================================
// API Functions
// ============================================================================

export const getActivityTimeline = async (
  filters: TimelineFilters = {}
): Promise<TimelineResponse> => {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', filters.limit.toString());
  if (filters.offset) params.set('offset', filters.offset.toString());
  if (filters.resource_type && filters.resource_type !== 'all') {
    params.set('resource_type', filters.resource_type);
  }
  if (filters.from_date) params.set('from_date', filters.from_date);
  if (filters.to_date) params.set('to_date', filters.to_date);

  const qs = params.toString();
  const response = await backendApi.get<TimelineResponse>(
    `/activity/timeline${qs ? `?${qs}` : ''}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch activity timeline: ${response.error.message}`);
  }

  return response.data!;
};

export const getActivityStats = async (): Promise<ActivityStatsResponse> => {
  const response = await backendApi.get<ActivityStatsResponse>(
    '/activity/stats',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch activity stats: ${response.error.message}`);
  }

  return response.data!;
};

export const getActivityHeatmap = async (
  days = 7
): Promise<HeatmapResponse> => {
  const response = await backendApi.get<HeatmapResponse>(
    `/activity/heatmap?days=${days}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch activity heatmap: ${response.error.message}`);
  }

  return response.data!;
};
