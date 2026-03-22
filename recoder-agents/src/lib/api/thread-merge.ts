import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MergeStrategy = 'append' | 'interleave' | 'summarize';
export type MergeStatus = 'pending' | 'completed' | 'failed' | 'reverted';

export interface MergePreviewRequest {
  source_thread_id: string;
  target_thread_id: string;
  merge_strategy: MergeStrategy;
}

export interface MergePreviewResponse {
  source_thread_id: string;
  target_thread_id: string;
  merge_strategy: string;
  source_message_count: number;
  target_message_count: number;
  estimated_merged_count: number;
  estimated_conflicts: number;
}

export interface MergeExecuteRequest {
  source_thread_id: string;
  target_thread_id: string;
  merge_strategy: MergeStrategy;
}

export interface ThreadMerge {
  merge_id: string;
  user_id: string;
  source_thread_id: string;
  target_thread_id: string;
  merge_strategy: string;
  merged_message_count: number;
  conflict_count: number;
  status: MergeStatus;
  merge_metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const previewMerge = async (
  data: MergePreviewRequest,
): Promise<MergePreviewResponse> => {
  const response = await backendApi.post<MergePreviewResponse>(
    '/threads/merge/preview',
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to preview merge: ${response.error.message}`);
  }
  return response.data!;
};

export const mergeThreads = async (
  data: MergeExecuteRequest,
): Promise<ThreadMerge> => {
  const response = await backendApi.post<ThreadMerge>(
    '/threads/merge',
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to merge threads: ${response.error.message}`);
  }
  return response.data!;
};

export const getMergeHistory = async (
  limit = 50,
): Promise<ThreadMerge[]> => {
  const response = await backendApi.get<ThreadMerge[]>(
    `/threads/merges?limit=${limit}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch merge history: ${response.error.message}`);
  }
  return response.data!;
};

export const getMergeDetail = async (
  mergeId: string,
): Promise<ThreadMerge> => {
  const response = await backendApi.get<ThreadMerge>(
    `/threads/merges/${mergeId}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch merge detail: ${response.error.message}`);
  }
  return response.data!;
};

export const revertMerge = async (
  mergeId: string,
): Promise<ThreadMerge> => {
  const response = await backendApi.post<ThreadMerge>(
    `/threads/merges/${mergeId}/revert`,
    {},
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to revert merge: ${response.error.message}`);
  }
  return response.data!;
};
