import { backendApi } from '../api-client';
import { parseHealthCheckResponse } from './contracts';

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  instance_id: string;
}

export const checkApiHealth = async (): Promise<HealthCheckResponse> => {
  const response = await backendApi.get<unknown>(
    '/health',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`API health check failed: ${response.error.message}`);
  }

  return parseHealthCheckResponse(response.data) as HealthCheckResponse;
};
