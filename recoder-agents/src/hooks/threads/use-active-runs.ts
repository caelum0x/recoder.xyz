'use client';

import { useQuery } from '@tanstack/react-query';
import { activeRunsApi, type ActiveRun } from '@/lib/api/active-runs';

export function useActiveRuns() {
  return useQuery<ActiveRun[]>({
    queryKey: ['active-runs'],
    queryFn: activeRunsApi.getActiveRuns,
    refetchInterval: 3_000,
    staleTime: 2_000,
  });
}
