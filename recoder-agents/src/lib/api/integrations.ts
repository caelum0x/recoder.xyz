import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface IntegrationStatus {
  provider: string;
  name: string;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'expired';
  connected_at: string | null;
  last_sync: string | null;
  error_message: string | null;
  scopes: string[];
}

export interface IntegrationListResponse {
  integrations: IntegrationStatus[];
}

export async function listIntegrations(): Promise<IntegrationListResponse> {
  try {
    const response = await backendApi.get<IntegrationListResponse>(
      '/integrations',
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list integrations', resource: 'integrations' });
    throw error;
  }
}

export async function getIntegration(provider: string): Promise<IntegrationStatus> {
  try {
    const response = await backendApi.get<IntegrationStatus>(
      `/integrations/${provider}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get integration', resource: 'integrations' });
    throw error;
  }
}

export async function disconnectIntegration(provider: string): Promise<{ status: string; provider: string }> {
  try {
    const response = await backendApi.delete<{ status: string; provider: string }>(
      `/integrations/${provider}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'disconnect integration', resource: 'integrations' });
    throw error;
  }
}

export async function refreshIntegration(provider: string): Promise<{ status: string; provider: string }> {
  try {
    const response = await backendApi.post<{ status: string; provider: string }>(
      `/integrations/${provider}/refresh`,
      {},
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'refresh integration', resource: 'integrations' });
    throw error;
  }
}
