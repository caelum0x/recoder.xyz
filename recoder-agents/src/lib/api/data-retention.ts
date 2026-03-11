import { backendApi } from '@/lib/api-client';
import { handleApiError } from '@/lib/error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResourceType =
  | 'threads'
  | 'run_logs'
  | 'audit_logs'
  | 'exports'
  | 'analytics'
  | 'notifications'
  | 'webhook_deliveries';

export interface RetentionPolicy {
  id: string;
  user_id: string;
  resource_type: ResourceType;
  retention_days: number;
  is_active: boolean;
  last_cleanup_at: string | null;
  items_cleaned: number;
  created_at: string;
}

export interface SetPolicyPayload {
  resource_type: ResourceType;
  retention_days: number;
  is_active?: boolean;
}

export interface CleanupResult {
  resource_type: ResourceType;
  items_deleted: number;
  duration_ms: number;
}

export interface CleanupRunResponse {
  status: string;
  results: CleanupResult[];
}

export interface CleanupLogEntry {
  id: string;
  policy_id: string;
  user_id: string;
  resource_type: ResourceType;
  items_deleted: number;
  oldest_item_date: string | null;
  cleanup_duration_ms: number | null;
  cleaned_at: string;
}

export interface CleanupPreviewItem {
  resource_type: ResourceType;
  retention_days: number;
  items_to_delete: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  threads: 'Threads',
  run_logs: 'Run Logs',
  audit_logs: 'Audit Logs',
  exports: 'Exports',
  analytics: 'Analytics',
  notifications: 'Notifications',
  webhook_deliveries: 'Webhook Deliveries',
};

export const RECOMMENDED_DEFAULTS: Record<ResourceType, number> = {
  threads: 180,
  run_logs: 90,
  audit_logs: 365,
  exports: 30,
  analytics: 180,
  notifications: 60,
  webhook_deliveries: 30,
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function getRetentionPolicies(): Promise<RetentionPolicy[]> {
  try {
    const response = await backendApi.get<RetentionPolicy[]>(
      '/retention/policies',
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'list retention policies', resource: 'data-retention' });
    throw error;
  }
}

export async function setRetentionPolicy(
  payload: SetPolicyPayload,
): Promise<RetentionPolicy> {
  try {
    const response = await backendApi.put<RetentionPolicy>(
      '/retention/policies',
      payload,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'set retention policy', resource: 'data-retention' });
    throw error;
  }
}

export async function deleteRetentionPolicy(
  policyId: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/retention/policies/${policyId}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'delete retention policy', resource: 'data-retention' });
    throw error;
  }
}

export async function runCleanup(): Promise<CleanupRunResponse> {
  try {
    const response = await backendApi.post<CleanupRunResponse>(
      '/retention/cleanup',
      undefined,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'run cleanup', resource: 'data-retention' });
    throw error;
  }
}

export async function getCleanupLog(
  options?: { resource_type?: string; limit?: number },
): Promise<CleanupLogEntry[]> {
  try {
    const params = new URLSearchParams();
    if (options?.resource_type) params.set('resource_type', options.resource_type);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();

    const response = await backendApi.get<CleanupLogEntry[]>(
      `/retention/cleanup-log${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'get cleanup log', resource: 'data-retention' });
    throw error;
  }
}

export async function getCleanupPreview(): Promise<CleanupPreviewItem[]> {
  try {
    const response = await backendApi.get<CleanupPreviewItem[]>(
      '/retention/preview',
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data ?? [];
  } catch (error) {
    handleApiError(error, { operation: 'preview cleanup', resource: 'data-retention' });
    throw error;
  }
}
