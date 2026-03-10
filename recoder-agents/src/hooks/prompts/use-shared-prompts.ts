import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getPromptSnippets,
  getPromptSnippet,
  createPromptSnippet,
  updatePromptSnippet,
  deletePromptSnippet,
  recordSnippetUsage,
  getPopularSnippets,
  type PromptSnippet,
  type SnippetListResponse,
  type CreateSnippetRequest,
  type UpdateSnippetRequest,
  type PopularSnippetsResponse,
  type SnippetFilters,
} from '@/lib/api/shared-prompts';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const snippetKeys = {
  all: ['prompt-snippets'] as const,
  lists: () => [...snippetKeys.all, 'list'] as const,
  list: (filters?: SnippetFilters) => [...snippetKeys.lists(), filters] as const,
  detail: (id: string) => [...snippetKeys.all, 'detail', id] as const,
  popular: () => [...snippetKeys.all, 'popular'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const usePromptSnippets = (filters?: SnippetFilters) => {
  return useQuery<SnippetListResponse>({
    queryKey: snippetKeys.list(filters),
    queryFn: () => getPromptSnippets(filters),
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const usePromptSnippet = (snippetId: string) => {
  return useQuery<PromptSnippet>({
    queryKey: snippetKeys.detail(snippetId),
    queryFn: () => getPromptSnippet(snippetId),
    enabled: !!snippetId,
    staleTime: 30000,
  });
};

export const useCreateSnippet = () => {
  const queryClient = useQueryClient();

  return useMutation<PromptSnippet, Error, CreateSnippetRequest>({
    mutationFn: (data) => createPromptSnippet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snippetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: snippetKeys.popular() });
      toast.success('Snippet created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create snippet');
    },
  });
};

export const useUpdateSnippet = () => {
  const queryClient = useQueryClient();

  return useMutation<
    PromptSnippet,
    Error,
    { snippetId: string; data: UpdateSnippetRequest }
  >({
    mutationFn: ({ snippetId, data }) => updatePromptSnippet(snippetId, data),
    onSuccess: (_, { snippetId }) => {
      queryClient.invalidateQueries({ queryKey: snippetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: snippetKeys.detail(snippetId) });
      toast.success('Snippet updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update snippet');
    },
  });
};

export const useDeleteSnippet = () => {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (snippetId) => deletePromptSnippet(snippetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snippetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: snippetKeys.popular() });
      toast.success('Snippet deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete snippet');
    },
  });
};

export const useRecordSnippetUsage = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { recorded: boolean },
    Error,
    { snippetId: string; agentId: string }
  >({
    mutationFn: ({ snippetId, agentId }) => recordSnippetUsage(snippetId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snippetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: snippetKeys.popular() });
    },
  });
};

export const usePopularSnippets = (limit: number = 10) => {
  return useQuery<PopularSnippetsResponse>({
    queryKey: snippetKeys.popular(),
    queryFn: () => getPopularSnippets(limit),
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};

export type { PromptSnippet, SnippetListResponse, SnippetFilters };
