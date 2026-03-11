'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPreferences,
  setPreference,
  batchSetPreferences,
  deletePreference,
  syncPush,
  syncPull,
  getSyncLog,
  type UserPreference,
  type SetPreferencePayload,
  type BatchSetPayload,
  type BatchSetResponse,
  type SyncPushPayload,
  type SyncPushResponse,
  type SyncLogEntry,
  type PreferenceCategory,
} from '@/lib/api/user-preferences-sync';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const preferenceSyncKeys = {
  all: ['user-preferences-sync'] as const,
  preferences: (category?: PreferenceCategory) =>
    [...preferenceSyncKeys.all, 'preferences', category ?? 'all'] as const,
  syncLog: () => [...preferenceSyncKeys.all, 'sync-log'] as const,
  syncPull: (since?: string) =>
    [...preferenceSyncKeys.all, 'sync-pull', since ?? 'all'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch all user preferences, optionally filtered by category. */
export function usePreferences(category?: PreferenceCategory) {
  return useQuery<UserPreference[]>({
    queryKey: preferenceSyncKeys.preferences(category),
    queryFn: () => getPreferences(category),
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
  });
}

/** Set a single preference (upsert). */
export function useSetPreference() {
  const qc = useQueryClient();
  return useMutation<UserPreference, Error, SetPreferencePayload>({
    mutationFn: (payload) => setPreference(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preferenceSyncKeys.all });
    },
  });
}

/** Batch set multiple preferences at once. */
export function useBatchSetPreferences() {
  const qc = useQueryClient();
  return useMutation<BatchSetResponse, Error, BatchSetPayload>({
    mutationFn: (payload) => batchSetPreferences(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preferenceSyncKeys.all });
    },
  });
}

/** Delete a preference by key. */
export function useDeletePreference() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (preferenceKey) => deletePreference(preferenceKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preferenceSyncKeys.all });
    },
  });
}

/** Push preferences for cross-device sync. */
export function useSyncPush() {
  const qc = useQueryClient();
  return useMutation<SyncPushResponse, Error, SyncPushPayload>({
    mutationFn: (payload) => syncPush(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: preferenceSyncKeys.all });
    },
  });
}

/** Pull preferences updated after a given timestamp. */
export function useSyncPull(since?: string) {
  return useQuery<UserPreference[]>({
    queryKey: preferenceSyncKeys.syncPull(since),
    queryFn: () => syncPull(since),
    staleTime: 15_000,
    gcTime: 60_000,
    enabled: false, // manual trigger via refetch
  });
}

/** Fetch sync log history. */
export function useSyncLog() {
  return useQuery<SyncLogEntry[]>({
    queryKey: preferenceSyncKeys.syncLog(),
    queryFn: () => getSyncLog(20),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
