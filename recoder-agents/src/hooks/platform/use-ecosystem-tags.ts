'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getTags,
  createTag,
  deleteTag,
  linkItem,
  unlinkItem,
  type EcosystemTag,
  type EcosystemTagItem,
  type CreateTagPayload,
  type LinkItemPayload,
} from '@/lib/api/ecosystem-tags';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const ecosystemTagKeys = {
  all: ['ecosystem-tags'] as const,
  lists: () => [...ecosystemTagKeys.all, 'list'] as const,
  details: (tagId: string) => [...ecosystemTagKeys.all, 'detail', tagId] as const,
  items: (tagId: string) => [...ecosystemTagKeys.all, 'items', tagId] as const,
} as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch all ecosystem tags for the current user. */
export function useTags(options?: { enabled?: boolean }) {
  return useQuery<EcosystemTag[]>({
    queryKey: ecosystemTagKeys.lists(),
    queryFn: getTags,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
    enabled: options?.enabled !== false,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new ecosystem tag. */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation<EcosystemTag, Error, CreateTagPayload>({
    mutationFn: (payload) => createTag(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ecosystemTagKeys.lists() });
      toast.success('Tag created');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create tag');
    },
  });
}

/** Delete an ecosystem tag. */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { tagId: string }>({
    mutationFn: ({ tagId }) => deleteTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ecosystemTagKeys.lists() });
      toast.success('Tag deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete tag');
    },
  });
}

/** Link an external item to a tag. */
export function useLinkItem() {
  const queryClient = useQueryClient();

  return useMutation<
    EcosystemTagItem,
    Error,
    { tagId: string } & LinkItemPayload
  >({
    mutationFn: ({ tagId, ...payload }) => linkItem(tagId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ecosystemTagKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: ecosystemTagKeys.items(variables.tagId),
      });
      toast.success('Item linked');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to link item');
    },
  });
}

/** Unlink an item from a tag. */
export function useUnlinkItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { tagId: string; itemId: string }>({
    mutationFn: ({ tagId, itemId }) => unlinkItem(tagId, itemId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ecosystemTagKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: ecosystemTagKeys.items(variables.tagId),
      });
      toast.success('Item unlinked');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to unlink item');
    },
  });
}
