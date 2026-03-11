'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPostmortems,
  getPostmortem,
  createPostmortem,
  updatePostmortem,
  deletePostmortem,
  publishPostmortem,
  getPostmortemStats,
  type Postmortem,
  type PostmortemStats,
  type PostmortemFilters,
  type CreatePostmortemData,
  type UpdatePostmortemData,
} from '@/lib/api/incident-postmortems';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const postmortemKeys = {
  all: ['postmortems'] as const,
  list: (filters?: PostmortemFilters) => [...postmortemKeys.all, 'list', filters] as const,
  detail: (id: string) => [...postmortemKeys.all, 'detail', id] as const,
  stats: () => [...postmortemKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch postmortems with optional filters. Polls every 30 seconds.
 */
export function usePostmortems(filters?: PostmortemFilters, options?: { enabled?: boolean }) {
  return useQuery<Postmortem[]>({
    queryKey: postmortemKeys.list(filters),
    queryFn: () => getPostmortems(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch a single postmortem by ID.
 */
export function usePostmortemDetail(id: string | null, options?: { enabled?: boolean }) {
  return useQuery<Postmortem>({
    queryKey: postmortemKeys.detail(id ?? ''),
    queryFn: () => getPostmortem(id!),
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!id && options?.enabled !== false,
  });
}

/**
 * Create a new postmortem. Invalidates list and stats on success.
 */
export function useCreatePostmortem() {
  const queryClient = useQueryClient();

  return useMutation<Postmortem, Error, CreatePostmortemData>({
    mutationFn: createPostmortem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postmortemKeys.all });
    },
  });
}

/**
 * Update an existing postmortem. Invalidates list, detail, and stats on success.
 */
export function useUpdatePostmortem() {
  const queryClient = useQueryClient();

  return useMutation<Postmortem, Error, { id: string; data: UpdatePostmortemData }>({
    mutationFn: ({ id, data }) => updatePostmortem(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: postmortemKeys.all });
      queryClient.invalidateQueries({
        queryKey: postmortemKeys.detail(variables.id),
      });
    },
  });
}

/**
 * Delete a postmortem. Invalidates list and stats on success.
 */
export function useDeletePostmortem() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: deletePostmortem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postmortemKeys.all });
    },
  });
}

/**
 * Publish a postmortem. Invalidates list, detail, and stats on success.
 */
export function usePublishPostmortem() {
  const queryClient = useQueryClient();

  return useMutation<Postmortem, Error, string>({
    mutationFn: publishPostmortem,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: postmortemKeys.all });
      queryClient.invalidateQueries({
        queryKey: postmortemKeys.detail(data.id),
      });
    },
  });
}

/**
 * Fetch postmortem stats. Polls every 30 seconds.
 */
export function usePostmortemStats(options?: { enabled?: boolean }) {
  return useQuery<PostmortemStats>({
    queryKey: postmortemKeys.stats(),
    queryFn: getPostmortemStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
