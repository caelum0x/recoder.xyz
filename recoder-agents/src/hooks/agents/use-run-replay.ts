'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getRunReplay,
  getRunReplaySummary,
  type RunReplayResponse,
  type ReplaySummary,
} from '@/lib/api/run-replay';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const runReplayKeys = {
  all: ['run-replay'] as const,
  replay: (agentId: string, runId: string) =>
    [...runReplayKeys.all, 'replay', agentId, runId] as const,
  summary: (agentId: string, runId: string) =>
    [...runReplayKeys.all, 'summary', agentId, runId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch full replay data (all steps) for a run.
 */
export function useRunReplay(agentId: string, runId: string, options?: { enabled?: boolean }) {
  return useQuery<RunReplayResponse>({
    queryKey: runReplayKeys.replay(agentId, runId),
    queryFn: () => getRunReplay(agentId, runId),
    enabled: (options?.enabled ?? true) && !!agentId && !!runId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * Fetch replay summary (step counts, timing, costs) for a run.
 */
export function useRunReplaySummary(agentId: string, runId: string, options?: { enabled?: boolean }) {
  return useQuery<ReplaySummary>({
    queryKey: runReplayKeys.summary(agentId, runId),
    queryFn: () => getRunReplaySummary(agentId, runId),
    enabled: (options?.enabled ?? true) && !!agentId && !!runId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
