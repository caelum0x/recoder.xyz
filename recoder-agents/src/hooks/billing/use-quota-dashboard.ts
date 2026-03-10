'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getQuotaUsageDaily,
  getQuotaUsageSummary,
  getQuotaForecast,
  getTopConsumers,
  type DailyUsageResponse,
  type UsageSummary,
  type UsageForecast,
  type TopConsumersResponse,
} from '@/lib/api/quota-dashboard';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const quotaDashboardKeys = {
  all: ['quota-dashboard'] as const,
  daily: (days: number, agentId?: string) =>
    [...quotaDashboardKeys.all, 'daily', { days, agentId }] as const,
  summary: () => [...quotaDashboardKeys.all, 'summary'] as const,
  forecast: () => [...quotaDashboardKeys.all, 'forecast'] as const,
  topConsumers: (metric: string) =>
    [...quotaDashboardKeys.all, 'top-consumers', metric] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch daily usage data for the last N days, optionally filtered by agent.
 */
export function useQuotaUsageDaily(days: number = 30, agentId?: string) {
  return useQuery<DailyUsageResponse>({
    queryKey: quotaDashboardKeys.daily(days, agentId),
    queryFn: () => getQuotaUsageDaily(days, agentId),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * Fetch usage summary for the current billing period vs limits.
 */
export function useQuotaUsageSummary() {
  return useQuery<UsageSummary>({
    queryKey: quotaDashboardKeys.summary(),
    queryFn: () => getQuotaUsageSummary(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * Fetch end-of-month forecast based on current usage rate.
 */
export function useQuotaForecast() {
  return useQuery<UsageForecast>({
    queryKey: quotaDashboardKeys.forecast(),
    queryFn: () => getQuotaForecast(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

/**
 * Fetch top consuming agents by a given metric.
 */
export function useTopConsumers(metric: 'runs' | 'tokens' | 'cost' = 'runs') {
  return useQuery<TopConsumersResponse>({
    queryKey: quotaDashboardKeys.topConsumers(metric),
    queryFn: () => getTopConsumers(metric),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
