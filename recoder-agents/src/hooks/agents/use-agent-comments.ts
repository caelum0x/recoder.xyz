import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getAgentComments,
  createAgentComment,
  updateAgentComment,
  deleteAgentComment,
  getAgentCommentCounts,
  type CommentListResponse,
  type AgentComment,
  type CommentCountResponse,
} from '@/lib/api/agent-comments';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const commentKeys = {
  all: ['agent-comments'] as const,
  lists: () => [...commentKeys.all, 'list'] as const,
  list: (agentId: string, filters?: Record<string, any>) =>
    [...commentKeys.lists(), agentId, filters] as const,
  counts: (agentId: string) =>
    [...commentKeys.all, 'counts', agentId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useAgentComments = (
  agentId: string,
  filters?: { section?: string; resolved?: boolean; limit?: number; offset?: number }
) => {
  return useQuery<CommentListResponse>({
    queryKey: commentKeys.list(agentId, filters),
    queryFn: () => getAgentComments(agentId, filters),
    enabled: !!agentId,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useCreateComment = () => {
  const queryClient = useQueryClient();

  return useMutation<
    AgentComment,
    Error,
    { agentId: string; data: { content: string; section?: string; parent_id?: string } }
  >({
    mutationFn: ({ agentId, data }) => createAgentComment(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: commentKeys.counts(agentId) });
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add comment');
    },
  });
};

export const useUpdateComment = () => {
  const queryClient = useQueryClient();

  return useMutation<
    AgentComment,
    Error,
    { agentId: string; commentId: string; data: { content?: string; is_resolved?: boolean } }
  >({
    mutationFn: ({ agentId, commentId, data }) => updateAgentComment(agentId, commentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: commentKeys.counts(agentId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update comment');
    },
  });
};

export const useDeleteComment = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; comment_id: string },
    Error,
    { agentId: string; commentId: string }
  >({
    mutationFn: ({ agentId, commentId }) => deleteAgentComment(agentId, commentId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: commentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: commentKeys.counts(agentId) });
      toast.success('Comment deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });
};

export const useCommentCounts = (agentId: string) => {
  return useQuery<CommentCountResponse>({
    queryKey: commentKeys.counts(agentId),
    queryFn: () => getAgentCommentCounts(agentId),
    enabled: !!agentId,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export type { AgentComment, CommentListResponse, CommentCountResponse };
