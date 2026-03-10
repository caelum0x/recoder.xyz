import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';
import type { ActiveRun } from './active-runs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus = 'running' | 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Run extends Omit<ActiveRun, 'status'> {
  status: RunStatus;
  completed_at?: string;
  thread_id?: string;
  project_id?: string;
  total_tokens?: number;
  error_message?: string;
}

export interface RunsListResponse {
  runs: Run[];
  total: number;
  has_more: boolean;
}

export interface RunDetail extends Run {
  messages?: Array<{
    message_id: string;
    type: string;
    content: string;
    metadata: string;
    created_at: string;
    updated_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function listRuns(params?: {
  status?: RunStatus;
  limit?: number;
  offset?: number;
}): Promise<RunsListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const queryString = searchParams.toString();
    const url = `/agents/runs${queryString ? `?${queryString}` : ''}`;

    const response = await backendApi.get<RunsListResponse>(url, {
      showErrors: false,
    });

    if (response.error) {
      // Fallback: if the endpoint doesn't exist, return empty data
      // This allows the UI to work even before the backend endpoint is implemented
      return { runs: [], total: 0, has_more: false };
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list runs', resource: 'runs' });
    return { runs: [], total: 0, has_more: false };
  }
}

async function getRunDetail(runId: string): Promise<RunDetail | null> {
  try {
    const response = await backendApi.get<RunDetail>(
      `/agents/runs/${runId}`,
      { showErrors: false },
    );
    if (response.error) {
      return null;
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get run detail', resource: 'run' });
    return null;
  }
}

export const runsApi = { listRuns, getRunDetail };
