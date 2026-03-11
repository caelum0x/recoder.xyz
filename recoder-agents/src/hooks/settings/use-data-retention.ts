'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRetentionPolicies,
  setRetentionPolicy,
  deleteRetentionPolicy,
  runCleanup,
  getCleanupLog,
  getCleanupPreview,
  type RetentionPolicy,
  type SetPolicyPayload,
  type CleanupRunResponse,
  type CleanupLogEntry,
  type CleanupPreviewItem,
} from '@/lib/api/data-retention';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const retentionKeys = {
  all: ['data-retention'] as const,
  policies: () => [...retentionKeys.all, 'policies'] as const,
  cleanupLog: (resourceType?: string) =>
    [...retentionKeys.all, 'cleanup-log', resourceType ?? 'all'] as const,
  preview: () => [...retentionKeys.all, 'preview'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch all retention policies for the current user. */
export function useRetentionPolicies() {
  return useQuery<RetentionPolicy[]>({
    queryKey: retentionKeys.policies(),
    queryFn: getRetentionPolicies,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
  });
}

/** Create or update a retention policy. */
export function useSetRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation<RetentionPolicy, Error, SetPolicyPayload>({
    mutationFn: (payload) => setRetentionPolicy(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: retentionKeys.policies() });
      qc.invalidateQueries({ queryKey: retentionKeys.preview() });
    },
  });
}

/** Delete a retention policy. */
export function useDeleteRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (policyId) => deleteRetentionPolicy(policyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: retentionKeys.policies() });
      qc.invalidateQueries({ queryKey: retentionKeys.preview() });
    },
  });
}

/** Run cleanup for all active policies. */
export function useRunCleanup() {
  const qc = useQueryClient();
  return useMutation<CleanupRunResponse, Error, void>({
    mutationFn: () => runCleanup(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: retentionKeys.all });
    },
  });
}

/** Fetch cleanup log history. */
export function useCleanupLog(resourceType?: string) {
  return useQuery<CleanupLogEntry[]>({
    queryKey: retentionKeys.cleanupLog(resourceType),
    queryFn: () => getCleanupLog({ resource_type: resourceType, limit: 20 }),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Preview items that would be cleaned up without actually deleting. */
export function useCleanupPreview() {
  const qc = useQueryClient();
  return useMutation<CleanupPreviewItem[], Error, void>({
    mutationFn: () => getCleanupPreview(),
    onSuccess: (data) => {
      qc.setQueryData(retentionKeys.preview(), data);
    },
  });
}
