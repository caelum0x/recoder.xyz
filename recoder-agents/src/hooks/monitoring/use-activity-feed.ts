'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordActivityEvent,
  getActivityFeed,
  markActivityRead,
  markAllActivitiesRead,
  getActivityPreferences,
  updateActivityPreferences,
  getActivityStats,
  type ActivityEvent,
  type ActivityFeedFilters,
  type ActivityFeedResponse,
  type RecordActivityBody,
  type ActivityPreferences,
  type UpdatePreferencesBody,
  type ActivityStats,
} from '@/lib/api/activity-feed';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const activityFeedKeys = {
  all: ['activity-feed'] as const,
  feeds: () => [...activityFeedKeys.all, 'feed'] as const,
  feed: (filters?: ActivityFeedFilters) =>
    [...activityFeedKeys.feeds(), filters] as const,
  preferences: () => [...activityFeedKeys.all, 'preferences'] as const,
  stats: () => [...activityFeedKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Record an activity event. Invalidates the feed + stats on success.
 */
export function useRecordActivity() {
  const queryClient = useQueryClient();
  return useMutation<ActivityEvent, Error, RecordActivityBody>({
    mutationFn: recordActivityEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.stats() });
    },
  });
}

/**
 * Fetch the activity feed with optional filters.
 */
export function useActivityFeed(filters?: ActivityFeedFilters) {
  return useQuery<ActivityFeedResponse>({
    queryKey: activityFeedKeys.feed(filters),
    queryFn: () => getActivityFeed(filters),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Mark a single activity event as read.
 */
export function useMarkActivityRead() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; is_read: boolean }, Error, string>({
    mutationFn: markActivityRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.stats() });
    },
  });
}

/**
 * Mark all activity events as read.
 */
export function useMarkAllActivitiesRead() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: markAllActivitiesRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.stats() });
    },
  });
}

/**
 * Fetch activity feed preferences.
 */
export function useActivityPreferences() {
  return useQuery<ActivityPreferences>({
    queryKey: activityFeedKeys.preferences(),
    queryFn: getActivityPreferences,
    staleTime: 60_000,
  });
}

/**
 * Update activity feed preferences.
 */
export function useUpdateActivityPreferences() {
  const queryClient = useQueryClient();
  return useMutation<ActivityPreferences, Error, UpdatePreferencesBody>({
    mutationFn: updateActivityPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: activityFeedKeys.preferences(),
      });
      // Preferences affect which events are shown, so invalidate feed too
      queryClient.invalidateQueries({ queryKey: activityFeedKeys.feeds() });
    },
  });
}

/**
 * Fetch activity feed stats (unread count, events today, most active hour).
 */
export function useActivityFeedStats() {
  return useQuery<ActivityStats>({
    queryKey: activityFeedKeys.stats(),
    queryFn: getActivityStats,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export type {
  ActivityEvent,
  ActivityFeedFilters,
  ActivityFeedResponse,
  RecordActivityBody,
  ActivityPreferences,
  UpdatePreferencesBody,
  ActivityStats,
};
