'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  notificationDigestApi,
  type DigestConfig,
  type DigestConfigUpdate,
  type DigestSummary,
  type DigestPreview,
  type DigestHistoryResponse,
} from '@/lib/api/notification-digest';

// ============================================================================
// Query Keys
// ============================================================================

export const digestKeys = {
  all: ['notification-digest'] as const,
  config: () => [...digestKeys.all, 'config'] as const,
  history: () => [...digestKeys.all, 'history'] as const,
  detail: (digestId: string) => [...digestKeys.all, 'detail', digestId] as const,
  preview: () => [...digestKeys.all, 'preview'] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useDigestConfig() {
  return useQuery<DigestConfig>({
    queryKey: digestKeys.config(),
    queryFn: () => notificationDigestApi.getConfig(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useDigestHistory(limit: number = 20, offset: number = 0) {
  return useQuery<DigestHistoryResponse>({
    queryKey: [...digestKeys.history(), limit, offset],
    queryFn: () => notificationDigestApi.getHistory(limit, offset),
    staleTime: 1000 * 60 * 2,
  });
}

export function useDigestDetail(digestId: string | undefined) {
  return useQuery<DigestSummary>({
    queryKey: digestKeys.detail(digestId ?? ''),
    queryFn: () => notificationDigestApi.getDetail(digestId!),
    enabled: !!digestId,
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useSetDigestConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: DigestConfigUpdate) =>
      notificationDigestApi.setConfig(update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: digestKeys.config() });
      toast.success('Digest settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update digest settings');
    },
  });
}

export function useGenerateDigest() {
  const queryClient = useQueryClient();

  return useMutation<DigestSummary, Error>({
    mutationFn: () => notificationDigestApi.generateDigest(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: digestKeys.history() });
      toast.success('Digest generated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate digest');
    },
  });
}

export function usePreviewDigest() {
  return useMutation<DigestPreview, Error>({
    mutationFn: () => notificationDigestApi.previewDigest(),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to preview digest');
    },
  });
}
