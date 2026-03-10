'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getActivityFeed,
  getPlatformStats,
  type ActivityFeedResponse,
  type PlatformStats,
} from '@/lib/api/platform';

export interface ActivityQueryParams {
  appFilter?: string;
  q?: string;
  dateRange?: 'today' | 'week' | 'month' | 'all';
  limit?: number;
  offset?: number;
}

export function usePlatformActivity(paramsOrFilter?: ActivityQueryParams | string) {
  // Support legacy string-only signature
  const params: ActivityQueryParams =
    typeof paramsOrFilter === 'string'
      ? { appFilter: paramsOrFilter }
      : paramsOrFilter ?? {};

  const { appFilter, q, dateRange, limit = 20, offset = 0 } = params;

  return useQuery<ActivityFeedResponse>({
    queryKey: ['platform-activity', appFilter, q, dateRange, limit, offset],
    queryFn: () =>
      getActivityFeed({
        limit,
        offset,
        app_filter: appFilter,
        q,
        date_range: dateRange,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function usePlatformStats() {
  return useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: getPlatformStats,
    staleTime: 60_000,
  });
}
