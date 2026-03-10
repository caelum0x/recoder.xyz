'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getRateLimitUsage,
  getRateLimitHistory,
  getRateLimitViolations,
  getTopEndpoints,
  type UsageResponse,
  type HistoryResponse,
  type ViolationsResponse,
  type TopEndpointsResponse,
} from '@/lib/api/rate-limits';

export function useRateLimitUsage() {
  return useQuery<UsageResponse>({
    queryKey: ['rate-limit-usage'],
    queryFn: getRateLimitUsage,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useRateLimitHistory(keyId?: string, hours: number = 24) {
  return useQuery<HistoryResponse>({
    queryKey: ['rate-limit-history', keyId, hours],
    queryFn: () => getRateLimitHistory(keyId, hours),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRateLimitViolations(keyId?: string, limit: number = 50) {
  return useQuery<ViolationsResponse>({
    queryKey: ['rate-limit-violations', keyId, limit],
    queryFn: () => getRateLimitViolations(keyId, limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useTopEndpoints(keyId?: string, limit: number = 20) {
  return useQuery<TopEndpointsResponse>({
    queryKey: ['rate-limit-top-endpoints', keyId, limit],
    queryFn: () => getTopEndpoints(keyId, limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
