'use client';

import { useQuery } from '@tanstack/react-query';
import { getSharedWithMe, type SharedWithMeResponse } from '@/lib/api/collaboration';

export function useSharedWithMe() {
  return useQuery<SharedWithMeResponse>({
    queryKey: ['shared-with-me'],
    queryFn: getSharedWithMe,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
