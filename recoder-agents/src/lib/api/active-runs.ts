import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface ActiveRun {
  id: string;
  agent_id: string;
  agent_name: string;
  model: string;
  started_at: string;
  token_count: number;
  estimated_cost: number;
  status: 'running' | 'pending';
}

async function getActiveRuns(): Promise<ActiveRun[]> {
  try {
    const response = await backendApi.get<ActiveRun[]>(
      '/agents/active-runs',
      { showErrors: false },
    );
    if (response.error) {
      return [];
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, {
      operation: 'list active runs',
      resource: 'active runs',
      silent: true,
    });
    return [];
  }
}

export const activeRunsApi = { getActiveRuns };
