'use client';

import { useQuery } from '@tanstack/react-query';
import { runsApi, type RunsListResponse, type RunDetail, type RunStatus } from '@/lib/api/runs';

export function useRuns(params?: {
  status?: RunStatus;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  return useQuery<RunsListResponse>({
    queryKey: ['runs', params?.status, params?.limit, params?.offset],
    queryFn: () =>
      runsApi.listRuns({
        status: params?.status,
        limit: params?.limit,
        offset: params?.offset,
      }),
    refetchInterval: params?.status === 'running' ? 3_000 : 10_000,
    staleTime: 2_000,
    enabled: params?.enabled !== false,
  });
}

export function useRunDetail(runId: string | null, options?: { enabled?: boolean }) {
  return useQuery<RunDetail | null>({
    queryKey: ['run-detail', runId],
    queryFn: () => (runId ? runsApi.getRunDetail(runId) : null),
    refetchInterval: 5_000,
    staleTime: 2_000,
    enabled: !!runId && (options?.enabled !== false),
  });
}
