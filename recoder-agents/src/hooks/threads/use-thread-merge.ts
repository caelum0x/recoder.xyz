import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  previewMerge,
  mergeThreads,
  getMergeHistory,
  getMergeDetail,
  revertMerge,
  type MergePreviewRequest,
  type MergeExecuteRequest,
  type MergePreviewResponse,
  type ThreadMerge,
} from '@/lib/api/thread-merge';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const mergeKeys = {
  all: ['thread-merges'] as const,
  history: () => [...mergeKeys.all, 'history'] as const,
  detail: (mergeId: string) => [...mergeKeys.all, 'detail', mergeId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const usePreviewMerge = () => {
  return useMutation<MergePreviewResponse, Error, MergePreviewRequest>({
    mutationFn: (data) => previewMerge(data),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to preview merge');
    },
  });
};

export const useMergeThreads = () => {
  const queryClient = useQueryClient();

  return useMutation<ThreadMerge, Error, MergeExecuteRequest>({
    mutationFn: (data) => mergeThreads(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mergeKeys.history() });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast.success('Threads merged successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to merge threads');
    },
  });
};

export const useMergeHistory = () => {
  return useQuery<ThreadMerge[]>({
    queryKey: mergeKeys.history(),
    queryFn: () => getMergeHistory(),
    staleTime: 30_000,
  });
};

export const useMergeDetail = (mergeId: string) => {
  return useQuery<ThreadMerge>({
    queryKey: mergeKeys.detail(mergeId),
    queryFn: () => getMergeDetail(mergeId),
    enabled: !!mergeId,
    staleTime: 30_000,
  });
};

export const useRevertMerge = () => {
  const queryClient = useQueryClient();

  return useMutation<ThreadMerge, Error, string>({
    mutationFn: (mergeId) => revertMerge(mergeId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: mergeKeys.history() });
      queryClient.invalidateQueries({ queryKey: mergeKeys.detail(result.merge_id) });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast.success('Merge reverted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revert merge');
    },
  });
};

export type { MergePreviewRequest, MergeExecuteRequest, MergePreviewResponse, ThreadMerge };
