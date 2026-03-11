import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getSharedPrompts,
  getSharedPrompt,
  createSharedPrompt,
  updateSharedPrompt,
  deleteSharedPrompt,
  useSharedPromptContent,
  getPromptVersions,
  getPopularSnippets,
  type SharedPrompt,
  type SharedPromptListResponse,
  type SharedPromptFilters,
  type CreateSharedPromptRequest,
  type UpdateSharedPromptRequest,
  type PromptVersionsResponse,
  type PopularSnippetsResponse,
} from '@/lib/api/shared-prompts';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const sharedPromptKeys = {
  all: ['shared-prompts'] as const,
  lists: () => [...sharedPromptKeys.all, 'list'] as const,
  list: (filters?: SharedPromptFilters) => [...sharedPromptKeys.lists(), filters] as const,
  detail: (id: string) => [...sharedPromptKeys.all, 'detail', id] as const,
  versions: (id: string) => [...sharedPromptKeys.all, 'versions', id] as const,
  popular: () => [...sharedPromptKeys.all, 'popular'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useSharedPrompts = (filters?: SharedPromptFilters) => {
  return useQuery<SharedPromptListResponse>({
    queryKey: sharedPromptKeys.list(filters),
    queryFn: () => getSharedPrompts(filters),
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useSharedPromptDetail = (promptId: string) => {
  return useQuery<SharedPrompt>({
    queryKey: sharedPromptKeys.detail(promptId),
    queryFn: () => getSharedPrompt(promptId),
    enabled: !!promptId,
    staleTime: 30000,
  });
};

export const useCreateSharedPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation<SharedPrompt, Error, CreateSharedPromptRequest>({
    mutationFn: (data) => createSharedPrompt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.popular() });
      toast.success('Prompt created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create prompt');
    },
  });
};

export const useUpdateSharedPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SharedPrompt,
    Error,
    { promptId: string; data: UpdateSharedPromptRequest }
  >({
    mutationFn: ({ promptId, data }) => updateSharedPrompt(promptId, data),
    onSuccess: (_, { promptId }) => {
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.detail(promptId) });
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.versions(promptId) });
      toast.success('Prompt updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update prompt');
    },
  });
};

export const useDeleteSharedPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (promptId) => deleteSharedPrompt(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.popular() });
      toast.success('Prompt deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete prompt');
    },
  });
};

export const useSharedPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation<SharedPrompt, Error, string>({
    mutationFn: (promptId) => useSharedPromptContent(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.lists() });
    },
  });
};

export const usePromptVersions = (promptId: string) => {
  return useQuery<PromptVersionsResponse>({
    queryKey: sharedPromptKeys.versions(promptId),
    queryFn: () => getPromptVersions(promptId),
    enabled: !!promptId,
    staleTime: 30000,
  });
};

// Legacy re-exports for backward compatibility
export const snippetKeys = sharedPromptKeys;
export const usePromptSnippets = useSharedPrompts;
export const usePromptSnippet = (snippetId: string) => useSharedPromptDetail(snippetId);
export const useCreateSnippet = useCreateSharedPrompt;
export const useUpdateSnippet = () => {
  const mutation = useUpdateSharedPrompt();
  return {
    ...mutation,
    mutateAsync: ({ snippetId, data }: { snippetId: string; data: UpdateSharedPromptRequest }) =>
      mutation.mutateAsync({ promptId: snippetId, data }),
  };
};
export const useDeleteSnippet = useDeleteSharedPrompt;
export const usePopularSnippets = (limit: number = 10) => {
  return useQuery<PopularSnippetsResponse>({
    queryKey: sharedPromptKeys.popular(),
    queryFn: () => getPopularSnippets(limit),
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};
export const useRecordSnippetUsage = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { recorded: boolean },
    Error,
    { snippetId: string; agentId: string }
  >({
    mutationFn: async ({ snippetId }) => {
      await useSharedPromptContent(snippetId);
      return { recorded: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sharedPromptKeys.popular() });
    },
  });
};

export type {
  SharedPrompt,
  SharedPromptListResponse,
  SharedPromptFilters,
  CreateSharedPromptRequest,
  UpdateSharedPromptRequest,
  PromptVersionsResponse,
};

// Legacy type re-exports
export type { SharedPrompt as PromptSnippet };
export type { SharedPromptListResponse as SnippetListResponse };
export type { SharedPromptFilters as SnippetFilters };
