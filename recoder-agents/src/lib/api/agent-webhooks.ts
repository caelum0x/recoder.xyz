import { backendApi } from '../api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Webhook {
  id: string;
  user_id: string;
  agent_id: string | null;
  name: string;
  url: string;
  secret?: string;
  secret_preview?: string;
  events: string[];
  is_active: boolean;
  retry_count: number;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
  delivered_count?: number;
  total_delivery_count?: number;
  last_delivery_at?: string | null;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, any>;
  response_status: number | null;
  response_body: string | null;
  attempt: number;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  delivered_at: string | null;
  created_at: string;
}

export interface CreateWebhookRequest {
  agent_id?: string | null;
  name: string;
  url: string;
  secret?: string | null;
  events: string[];
  retry_count?: number;
  timeout_ms?: number;
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  is_active?: boolean;
  retry_count?: number;
  timeout_ms?: number;
  agent_id?: string | null;
}

export interface DeliveryFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

export const WEBHOOK_EVENTS = [
  { value: 'run.started', label: 'Run Started', group: 'Run Events' },
  { value: 'run.completed', label: 'Run Completed', group: 'Run Events' },
  { value: 'run.failed', label: 'Run Failed', group: 'Run Events' },
  { value: 'run.error', label: 'Run Error', group: 'Run Events' },
  { value: 'thread.created', label: 'Thread Created', group: 'Thread Events' },
  { value: 'thread.message', label: 'Thread Message', group: 'Thread Events' },
  { value: 'agent.updated', label: 'Agent Updated', group: 'Agent Events' },
  { value: 'agent.deployed', label: 'Agent Deployed', group: 'Agent Events' },
] as const;

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const createWebhook = async (data: CreateWebhookRequest): Promise<Webhook> => {
  const response = await backendApi.post<Webhook>('/agent-webhooks/webhooks', data);
  if (response.error) {
    throw new Error(`Failed to create webhook: ${response.error.message}`);
  }
  return response.data!;
};

export const listWebhooks = async (agentId?: string): Promise<Webhook[]> => {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const response = await backendApi.get<{ webhooks: Webhook[] }>(
    `/agent-webhooks/webhooks${query}`,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to list webhooks: ${response.error.message}`);
  }
  return response.data!.webhooks;
};

export const updateWebhook = async (
  webhookId: string,
  data: UpdateWebhookRequest
): Promise<Webhook> => {
  const response = await backendApi.patch<Webhook>(
    `/agent-webhooks/webhooks/${webhookId}`,
    data
  );
  if (response.error) {
    throw new Error(`Failed to update webhook: ${response.error.message}`);
  }
  return response.data!;
};

export const deleteWebhook = async (webhookId: string): Promise<void> => {
  const response = await backendApi.delete(`/agent-webhooks/webhooks/${webhookId}`);
  if (response.error) {
    throw new Error(`Failed to delete webhook: ${response.error.message}`);
  }
};

export const testWebhook = async (webhookId: string): Promise<WebhookDelivery> => {
  const response = await backendApi.post<WebhookDelivery>(
    `/agent-webhooks/webhooks/${webhookId}/test`
  );
  if (response.error) {
    throw new Error(`Failed to test webhook: ${response.error.message}`);
  }
  return response.data!;
};

export const listDeliveries = async (
  webhookId: string,
  filters?: DeliveryFilters
): Promise<{ deliveries: WebhookDelivery[]; total: number }> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<{ deliveries: WebhookDelivery[]; total: number }>(
    `/agent-webhooks/webhooks/${webhookId}/deliveries${query}`,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to list deliveries: ${response.error.message}`);
  }
  return response.data!;
};

export const retryDelivery = async (deliveryId: string): Promise<WebhookDelivery> => {
  const response = await backendApi.post<WebhookDelivery>(
    `/agent-webhooks/webhooks/deliveries/${deliveryId}/retry`
  );
  if (response.error) {
    throw new Error(`Failed to retry delivery: ${response.error.message}`);
  }
  return response.data!;
};
