import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyActivity {
  date: string;
  run_count: number;
  message_count: number;
  error_count: number;
  total_cost: number;
}

export interface HeatmapResponse {
  days: DailyActivity[];
}

export interface StreaksResponse {
  current_streak: number;
  longest_streak: number;
}

export interface WeeklySummaryEntry {
  week_start: string;
  run_count: number;
  message_count: number;
  error_count: number;
  total_cost: number;
}

export interface WeeklySummaryResponse {
  weeks: WeeklySummaryEntry[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAgentActivityHeatmap = async (
  agentId?: string
): Promise<HeatmapResponse> => {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  const qs = params.toString();
  const response = await backendApi.get<HeatmapResponse>(
    `/agents/activity/heatmap${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getActivityStreaks = async (): Promise<StreaksResponse> => {
  const response = await backendApi.get<StreaksResponse>(
    '/agents/activity/streaks',
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getWeeklyActivitySummary = async (): Promise<WeeklySummaryResponse> => {
  const response = await backendApi.get<WeeklySummaryResponse>(
    '/agents/activity/weekly-summary',
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
