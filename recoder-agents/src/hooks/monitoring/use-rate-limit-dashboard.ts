'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRateLimitEvents,
  getRateLimitSummary,
  getRateLimitTimeline,
  getRateLimitConfigs,
  updateRateLimitConfig,
  type EventFilters,
  type UpdateConfigRequest,
  type RateLimitEvent,
  type RateLimitSummary,
  type TimelineBucket,
  type RateLimitConfig,
} from '@/lib/api/rate-limit-dashboard';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const rateLimitKeys = {
  all: ['rate-limit-dashboard'] as const,
  events: (filters?: EventFilters) => [...rateLimitKeys.all, 'events', filters] as const,
  summary: (hours?: number) => [...rateLimitKeys.all, 'summary', hours] as const,
  timeline: (hours?: number) => [...rateLimitKeys.all, 'timeline', hours] as const,
  configs: () => [...rateLimitKeys.all, 'configs'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useRateLimitEvents(filters: EventFilters = {}) {
  return useQuery<RateLimitEvent[]>({
    queryKey: rateLimitKeys.events(filters),
    queryFn: () => getRateLimitEvents(filters),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRateLimitSummary(hours: number = 24) {
  return useQuery<RateLimitSummary>({
    queryKey: rateLimitKeys.summary(hours),
    queryFn: () => getRateLimitSummary(hours),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRateLimitTimeline(hours: number = 24) {
  return useQuery<TimelineBucket[]>({
    queryKey: rateLimitKeys.timeline(hours),
    queryFn: () => getRateLimitTimeline(hours),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRateLimitConfigs() {
  return useQuery<RateLimitConfig[]>({
    queryKey: rateLimitKeys.configs(),
    queryFn: () => getRateLimitConfigs(),
    staleTime: 60_000,
  });
}

export function useUpdateRateLimitConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateConfigRequest) => updateRateLimitConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rateLimitKeys.configs() });
    },
  });
}
