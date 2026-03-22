import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface ModelMetrics {
  model: string;
  total_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  cost_per_run: number;
  total_cost: number;
  recommendation: string;
}

export interface ModelAnalyticsResponse {
  models: ModelMetrics[];
  range: string;
  fastest_model: string;
  cheapest_model: string;
  most_reliable_model: string;
}

export async function getModelAnalytics(agentId: string, range: string = '30d'): Promise<ModelAnalyticsResponse> {
  try {
    const response = await backendApi.get<ModelAnalyticsResponse>(
      `/agents/${agentId}/analytics/models?range=${range}`,
      { showErrors: true },
    );
    if (response.error) {
      throw new Error(`Error fetching model analytics: ${response.error.message}`);
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get model analytics', resource: 'model analytics' });
    throw error;
  }
}
