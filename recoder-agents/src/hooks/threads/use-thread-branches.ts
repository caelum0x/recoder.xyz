import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  createBranch,
  getThreadBranches,
  getBranchDetail,
  updateBranch,
  deleteBranch,
  getBranchTree,
  type ThreadBranch,
  type BranchListResponse,
  type CreateBranchRequest,
  type UpdateBranchRequest,
  type BranchTreeResponse,
} from '@/lib/api/thread-branches';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const branchKeys = {
  all: ['thread-branches'] as const,
  lists: () => [...branchKeys.all, 'list'] as const,
  list: (threadId: string) => [...branchKeys.lists(), threadId] as const,
  detail: (branchId: string) => [...branchKeys.all, 'detail', branchId] as const,
  tree: (threadId: string) => [...branchKeys.all, 'tree', threadId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useCreateBranch = () => {
  const queryClient = useQueryClient();

  return useMutation<
    ThreadBranch,
    Error,
    { threadId: string; data: CreateBranchRequest }
  >({
    mutationFn: ({ threadId, data }) => createBranch(threadId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: branchKeys.list(result.source_thread_id),
      });
      queryClient.invalidateQueries({
        queryKey: branchKeys.tree(result.source_thread_id),
      });
      toast.success('Branch created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create branch');
    },
  });
};

export const useThreadBranches = (threadId: string) => {
  return useQuery<BranchListResponse>({
    queryKey: branchKeys.list(threadId),
    queryFn: () => getThreadBranches(threadId),
    enabled: !!threadId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useBranchDetail = (branchId: string) => {
  return useQuery<ThreadBranch>({
    queryKey: branchKeys.detail(branchId),
    queryFn: () => getBranchDetail(branchId),
    enabled: !!branchId,
    staleTime: 30000,
  });
};

export const useUpdateBranch = () => {
  const queryClient = useQueryClient();

  return useMutation<
    ThreadBranch,
    Error,
    { branchId: string; data: UpdateBranchRequest }
  >({
    mutationFn: ({ branchId, data }) => updateBranch(branchId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: branchKeys.detail(result.id),
      });
      queryClient.invalidateQueries({
        queryKey: branchKeys.list(result.source_thread_id),
      });
      queryClient.invalidateQueries({
        queryKey: branchKeys.tree(result.source_thread_id),
      });
      toast.success('Branch updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update branch');
    },
  });
};

export const useDeleteBranch = () => {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, { branchId: string; sourceThreadId: string }>({
    mutationFn: ({ branchId }) => deleteBranch(branchId),
    onSuccess: (_, { sourceThreadId }) => {
      queryClient.invalidateQueries({
        queryKey: branchKeys.list(sourceThreadId),
      });
      queryClient.invalidateQueries({
        queryKey: branchKeys.tree(sourceThreadId),
      });
      toast.success('Branch deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete branch');
    },
  });
};

export const useBranchTree = (threadId: string) => {
  return useQuery<BranchTreeResponse>({
    queryKey: branchKeys.tree(threadId),
    queryFn: () => getBranchTree(threadId),
    enabled: !!threadId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export type { ThreadBranch, BranchListResponse, CreateBranchRequest, UpdateBranchRequest, BranchTreeResponse };
