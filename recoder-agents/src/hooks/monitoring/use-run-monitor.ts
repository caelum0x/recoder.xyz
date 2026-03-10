'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getActiveRuns,
  getRunTimeline,
  getMonitorStats,
  type ActiveRun,
  type RunSnapshot,
  type MonitorStats,
} from '@/lib/api/run-monitor';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const runMonitorKeys = {
  all: ['run-monitor'] as const,
  activeRuns: () => [...runMonitorKeys.all, 'active-runs'] as const,
  timeline: (runId: string) => [...runMonitorKeys.all, 'timeline', runId] as const,
  stats: () => [...runMonitorKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Poll active runs every 5 seconds for real-time monitoring.
 */
export function useActiveRuns(options?: { enabled?: boolean }) {
  return useQuery<ActiveRun[]>({
    queryKey: runMonitorKeys.activeRuns(),
    queryFn: getActiveRuns,
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch the snapshot timeline for a specific run.
 * Polls every 5 seconds while enabled.
 */
export function useRunTimeline(runId: string | null, options?: { enabled?: boolean }) {
  return useQuery<RunSnapshot[]>({
    queryKey: runMonitorKeys.timeline(runId ?? ''),
    queryFn: () => getRunTimeline(runId!),
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 30_000,
    enabled: !!runId && options?.enabled !== false,
  });
}

/**
 * Fetch real-time monitor stats (active count, latency, errors, cost).
 * Polls every 5 seconds.
 */
export function useMonitorStats(options?: { enabled?: boolean }) {
  return useQuery<MonitorStats>({
    queryKey: runMonitorKeys.stats(),
    queryFn: getMonitorStats,
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
