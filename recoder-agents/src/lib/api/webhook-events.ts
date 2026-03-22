import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  id: string;
  webhook_id: string;
  event_type: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  request_payload?: Record<string, unknown>;
  response_status?: number;
  response_body?: string;
  duration_ms?: number;
  attempt_count: number;
  max_attempts: number;
  error_message?: string;
  next_retry_at?: string;
  delivered_at?: string;
  failed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventListResponse {
  events: WebhookEvent[];
  total: number;
}

export interface WebhookEventStats {
  total_events: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  retrying_count: number;
  success_rate: number;
  avg_duration_ms?: number;
}

export interface RetryEventResponse {
  success: boolean;
  message: string;
}

export type WebhookEventStatus = 'pending' | 'success' | 'failed' | 'retrying';

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listWebhookEvents(
  webhookId: string,
  options?: {
    status?: WebhookEventStatus;
    event_type?: string;
    limit?: number;
    offset?: number;
  },
): Promise<WebhookEventListResponse> {
  try {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.event_type) params.set('event_type', options.event_type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const qs = params.toString();

    const response = await backendApi.get<WebhookEventListResponse>(
      `/webhooks/${webhookId}/events${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list webhook events', resource: 'webhook-events' });
    throw error;
  }
}

export async function listRecentWebhookEvents(
  options?: {
    status?: WebhookEventStatus;
    limit?: number;
  },
): Promise<WebhookEventListResponse> {
  try {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();

    const response = await backendApi.get<WebhookEventListResponse>(
      `/webhooks/events/recent${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list recent webhook events', resource: 'webhook-events' });
    throw error;
  }
}

export async function retryWebhookEvent(
  eventId: string,
): Promise<RetryEventResponse> {
  try {
    const response = await backendApi.post<RetryEventResponse>(
      `/webhooks/events/${eventId}/retry`,
      undefined,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'retry webhook event', resource: 'webhook-events' });
    throw error;
  }
}

export async function getWebhookEventStats(
  webhookId?: string,
): Promise<WebhookEventStats> {
  try {
    const params = new URLSearchParams();
    if (webhookId) params.set('webhook_id', webhookId);
    const qs = params.toString();

    const response = await backendApi.get<WebhookEventStats>(
      `/webhooks/events/stats${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get webhook event stats', resource: 'webhook-events' });
    throw error;
  }
}
