import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpointListItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status?: number;
  response_body?: string;
  attempts: number;
  max_attempts: number;
  delivered_at?: string;
  failed_at?: string;
  next_retry_at?: string;
  created_at: string;
}

export interface DeliveryListResponse {
  deliveries: WebhookDelivery[];
}

export interface CreateWebhookPayload {
  url: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookPayload {
  url?: string;
  events?: string[];
  active?: boolean;
  description?: string;
}

// ---------------------------------------------------------------------------
// Webhook event types
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  'agent.created',
  'agent.updated',
  'agent.deleted',
  'thread.created',
  'thread.completed',
  'thread.failed',
  'workflow.executed',
  'workflow.completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function createWebhook(
  payload: CreateWebhookPayload,
): Promise<WebhookEndpoint> {
  try {
    const response = await backendApi.post<WebhookEndpoint>(
      '/webhooks',
      payload,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create webhook', resource: 'webhooks' });
    throw error;
  }
}

export async function listWebhooks(): Promise<WebhookEndpointListItem[]> {
  try {
    const response = await backendApi.get<WebhookEndpointListItem[]>(
      '/webhooks',
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list webhooks', resource: 'webhooks' });
    throw error;
  }
}

export async function getWebhook(webhookId: string): Promise<WebhookEndpoint> {
  try {
    const response = await backendApi.get<WebhookEndpoint>(
      `/webhooks/${webhookId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get webhook', resource: 'webhooks' });
    throw error;
  }
}

export async function updateWebhook(
  webhookId: string,
  payload: UpdateWebhookPayload,
): Promise<WebhookEndpoint> {
  try {
    const response = await backendApi.patch<WebhookEndpoint>(
      `/webhooks/${webhookId}`,
      payload,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update webhook', resource: 'webhooks' });
    throw error;
  }
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/webhooks/${webhookId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'delete webhook', resource: 'webhooks' });
    throw error;
  }
}

export async function testWebhook(
  webhookId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await backendApi.post<{ success: boolean; message: string }>(
      `/webhooks/${webhookId}/test`,
      undefined,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'test webhook', resource: 'webhooks' });
    throw error;
  }
}

export async function getDeliveries(
  webhookId: string,
  limit?: number,
): Promise<DeliveryListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.set('limit', String(limit));
    const qs = searchParams.toString();
    const response = await backendApi.get<DeliveryListResponse>(
      `/webhooks/${webhookId}/deliveries${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get deliveries', resource: 'webhooks' });
    throw error;
  }
}

export async function retryDelivery(
  deliveryId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await backendApi.post<{ success: boolean; message: string }>(
      `/webhooks/deliveries/${deliveryId}/retry`,
      undefined,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'retry delivery', resource: 'webhooks' });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Signing secret management
// ---------------------------------------------------------------------------

export interface SigningSecretResponse {
  signing_secret: string;
}

export async function getSigningSecret(
  webhookId: string,
): Promise<SigningSecretResponse> {
  try {
    const response = await backendApi.get<SigningSecretResponse>(
      `/webhooks/${webhookId}/signing-secret`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get signing secret', resource: 'webhooks' });
    throw error;
  }
}

export async function rotateSigningSecret(
  webhookId: string,
): Promise<SigningSecretResponse> {
  try {
    const response = await backendApi.post<SigningSecretResponse>(
      `/webhooks/${webhookId}/rotate-secret`,
      undefined,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'rotate signing secret', resource: 'webhooks' });
    throw error;
  }
}
