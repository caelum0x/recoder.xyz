import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface BulkOperation {
  id: string;
  user_id: string;
  operation_type: string;
  target_ids: string[];
  target_count: number;
  params: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  processed_count: number;
  error_count: number;
  errors: Array<{ target_id: string; error: string }>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface BulkExecuteRequest {
  operation_type: string;
  target_ids: string[];
  params?: Record<string, unknown>;
}

export interface BulkExecuteResponse extends BulkOperation {
  skipped_invalid_ids?: string[];
}

export interface BulkPreviewRequest {
  operation_type: string;
  target_ids: string[];
  params?: Record<string, unknown>;
}

export interface BulkPreviewResponse {
  valid_count: number;
  invalid_ids: string[];
  preview_message: string;
  operation_type: string;
}

export interface BulkOpStats {
  total_operations: number;
  completed: number;
  failed: number;
  success_rate_pct: number;
  avg_targets_per_op: number;
  most_used_operation: string | null;
}

export interface BulkOperationFilters {
  status?: string;
  operation_type?: string;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function executeBulkOperation(
  request: BulkExecuteRequest,
): Promise<BulkExecuteResponse> {
  try {
    const response = await backendApi.post<BulkExecuteResponse>(
      '/bulk/execute',
      request,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'execute bulk operation', resource: 'bulk-operations' });
    throw error;
  }
}

export async function getBulkOperations(
  filters?: BulkOperationFilters,
): Promise<BulkOperation[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.operation_type) params.set('operation_type', filters.operation_type);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();

    const response = await backendApi.get<BulkOperation[]>(
      `/bulk/operations${qs ? `?${qs}` : ''}`,
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list bulk operations', resource: 'bulk-operations' });
    throw error;
  }
}

export async function getBulkOperationDetail(
  opId: string,
): Promise<BulkOperation> {
  try {
    const response = await backendApi.get<BulkOperation>(
      `/bulk/operations/${opId}`,
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get bulk operation detail', resource: 'bulk-operations' });
    throw error;
  }
}

export async function previewBulkOperation(
  request: BulkPreviewRequest,
): Promise<BulkPreviewResponse> {
  try {
    const response = await backendApi.post<BulkPreviewResponse>(
      '/bulk/preview',
      request,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'preview bulk operation', resource: 'bulk-operations' });
    throw error;
  }
}

export async function getBulkOpStats(): Promise<BulkOpStats> {
  try {
    const response = await backendApi.get<BulkOpStats>(
      '/bulk/stats',
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get bulk op stats', resource: 'bulk-operations' });
    throw error;
  }
}
