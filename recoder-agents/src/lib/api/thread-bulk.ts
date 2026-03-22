import { backendApi } from '../api-client';

// --- Types ---

export interface BulkOperationResponse {
  deleted?: number;
  archived?: number;
  unarchived?: number;
  failed: number;
  deleted_ids?: string[];
  archived_ids?: string[];
  unarchived_ids?: string[];
  failed_details: Array<{ thread_id: string; reason: string }>;
}

export interface ArchivedThread {
  thread_id: string;
  archived_at: string | null;
  thread_name: string | null;
  agent_id: string | null;
  thread_updated_at: string | null;
  project_id: string | null;
  project_name: string | null;
  project_icon_name: string | null;
}

export interface ArchivedThreadsResponse {
  threads: ArchivedThread[];
  total: number;
  limit: number;
  offset: number;
}

// --- API Functions ---

export async function bulkDeleteThreads(threadIds: string[]): Promise<BulkOperationResponse> {
  const response = await backendApi.post<BulkOperationResponse>('/threads/bulk-delete', {
    thread_ids: threadIds,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to bulk delete threads');
  }

  return response.data!;
}

export async function bulkArchiveThreads(threadIds: string[]): Promise<BulkOperationResponse> {
  const response = await backendApi.post<BulkOperationResponse>('/threads/bulk-archive', {
    thread_ids: threadIds,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to bulk archive threads');
  }

  return response.data!;
}

export async function bulkUnarchiveThreads(threadIds: string[]): Promise<BulkOperationResponse> {
  const response = await backendApi.post<BulkOperationResponse>('/threads/bulk-unarchive', {
    thread_ids: threadIds,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to bulk unarchive threads');
  }

  return response.data!;
}

export async function getArchivedThreads(
  limit: number = 50,
  offset: number = 0
): Promise<ArchivedThreadsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  const response = await backendApi.get<ArchivedThreadsResponse>(
    `/threads/archived?${params.toString()}`,
    { showErrors: false }
  );

  if (response.error) {
    return { threads: [], total: 0, limit, offset };
  }

  return response.data || { threads: [], total: 0, limit, offset };
}
