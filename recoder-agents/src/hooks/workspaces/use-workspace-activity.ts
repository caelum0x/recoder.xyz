'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getWorkspaceActivity,
  getActivitySummary,
  getActivityTimeline,
  type ActivityFilters,
} from '@/lib/api/workspace-activity';

const activityKeys = {
  all: ['workspace-activity'] as const,
  list: (filters?: ActivityFilters) =>
    [...activityKeys.all, 'list', filters] as const,
  summary: () => [...activityKeys.all, 'summary'] as const,
  timeline: (hours: number) =>
    [...activityKeys.all, 'timeline', hours] as const,
};

export function useWorkspaceActivity(filters?: ActivityFilters) {
  return useQuery({
    queryKey: activityKeys.list(filters),
    queryFn: () => getWorkspaceActivity(filters),
    staleTime: 30_000,
    refetchInterval: 30_000, // Auto-refresh every 30s
  });
}

export function useWorkspaceActivitySummary() {
  return useQuery({
    queryKey: activityKeys.summary(),
    queryFn: getActivitySummary,
    staleTime: 60_000,
  });
}

export function useWorkspaceActivityTimeline(hours: number = 24) {
  return useQuery({
    queryKey: activityKeys.timeline(hours),
    queryFn: () => getActivityTimeline(hours),
    staleTime: 60_000,
  });
}
