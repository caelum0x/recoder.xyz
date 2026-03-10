'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getActivityTimeline,
  getActivityStats,
  getActivityHeatmap,
  type TimelineResponse,
  type ActivityStatsResponse,
  type HeatmapResponse,
  type TimelineFilters,
} from '@/lib/api/unified-activity';

// ============================================================================
// Query Keys
// ============================================================================

export const activityKeys = {
  all: ['activity'] as const,
  timeline: (filters: TimelineFilters) => [...activityKeys.all, 'timeline', filters] as const,
  stats: () => [...activityKeys.all, 'stats'] as const,
  heatmap: (days: number) => [...activityKeys.all, 'heatmap', days] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export const useActivityTimeline = (filters: TimelineFilters = {}) => {
  return useQuery<TimelineResponse>({
    queryKey: activityKeys.timeline(filters),
    queryFn: () => getActivityTimeline(filters),
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
};

export const useActivityStats = () => {
  return useQuery<ActivityStatsResponse>({
    queryKey: activityKeys.stats(),
    queryFn: () => getActivityStats(),
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });
};

export const useActivityHeatmap = (days = 7) => {
  return useQuery<HeatmapResponse>({
    queryKey: activityKeys.heatmap(days),
    queryFn: () => getActivityHeatmap(days),
    staleTime: 120000,
    refetchOnWindowFocus: true,
  });
};
