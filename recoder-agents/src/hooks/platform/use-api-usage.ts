'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getKeyUsage,
  getKeyRecentUsage,
  getUsageSummary,
  type DailyUsageStats,
  type RecentRequest,
  type UsageSummary,
} from '@/lib/api/api-usage';

const KEY_USAGE_KEY = ['key-usage'] as const;
const KEY_RECENT_KEY = ['key-recent-usage'] as const;
const USAGE_SUMMARY_KEY = ['api-usage-summary'] as const;

export function useKeyUsage(keyId: string, days?: number) {
  return useQuery<DailyUsageStats[]>({
    queryKey: [...KEY_USAGE_KEY, keyId, days],
    queryFn: () => getKeyUsage(keyId, days),
    enabled: !!keyId,
    staleTime: 60_000,
  });
}

export function useKeyRecentUsage(keyId: string) {
  return useQuery<RecentRequest[]>({
    queryKey: [...KEY_RECENT_KEY, keyId],
    queryFn: () => getKeyRecentUsage(keyId),
    enabled: !!keyId,
    staleTime: 30_000,
  });
}

export function useUsageSummary() {
  return useQuery<UsageSummary>({
    queryKey: [...USAGE_SUMMARY_KEY],
    queryFn: getUsageSummary,
    staleTime: 60_000,
  });
}
