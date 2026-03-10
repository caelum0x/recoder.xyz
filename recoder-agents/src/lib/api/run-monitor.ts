import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string | null;
  status: string;
  current_tool: string | null;
  step_count: number;
  tokens_used: number;
  cost_so_far: number;
  elapsed_ms: number;
  started_at: string | null;
}

export interface RunSnapshot {
  id: string;
  run_id: string;
  agent_id: string;
  status: string;
  step_count: number;
  current_tool: string | null;
  tokens_used: number;
  cost_so_far: number;
  elapsed_ms: number;
  error: string | null;
  captured_at: string;
}

export interface MonitorStats {
  active_runs: number;
  avg_latency_ms: number;
  errors_today: number;
  cost_today: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getActiveRuns = async (): Promise<ActiveRun[]> => {
  const response = await backendApi.get<ActiveRun[]>(
    '/monitor/runs/active',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch active runs: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getRunTimeline = async (
  runId: string,
  limit: number = 100
): Promise<RunSnapshot[]> => {
  const response = await backendApi.get<RunSnapshot[]>(
    `/monitor/runs/${runId}/timeline?limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch run timeline: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getMonitorStats = async (): Promise<MonitorStats> => {
  const response = await backendApi.get<MonitorStats>(
    '/monitor/stats',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch monitor stats: ${response.error.message}`);
  }

  return response.data!;
};

export const recordRunSnapshot = async (
  runId: string,
  data: {
    agent_id: string;
    status: string;
    step_count?: number;
    current_tool?: string;
    tokens_used?: number;
    cost_so_far?: number;
    elapsed_ms?: number;
    error?: string;
  }
): Promise<{ success: boolean; id?: string; captured_at?: string }> => {
  const response = await backendApi.post<{ success: boolean; id?: string; captured_at?: string }>(
    `/monitor/runs/${runId}/snapshot`,
    data,
    { showErrors: false }
  );

  if (response.error) {
    throw new Error(`Failed to record snapshot: ${response.error.message}`);
  }

  return response.data!;
};
