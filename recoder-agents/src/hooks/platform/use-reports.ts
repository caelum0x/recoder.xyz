'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getUsageSummary,
  getUsageByAgent,
  getUsageByModel,
  getUsageByDay,
  type ReportPeriod,
  type Granularity,
  type UsageSummary,
  type AgentUsage,
  type ModelUsage,
  type DailyUsage,
} from '@/lib/api/reports';

export function useUsageSummary(period: ReportPeriod) {
  return useQuery<UsageSummary>({
    queryKey: ['reports', 'usage-summary', period],
    queryFn: () => getUsageSummary(period),
    staleTime: 60_000,
  });
}

export function useUsageByAgent(period: ReportPeriod) {
  return useQuery<AgentUsage[]>({
    queryKey: ['reports', 'usage-by-agent', period],
    queryFn: () => getUsageByAgent(period),
    staleTime: 60_000,
  });
}

export function useUsageByModel(period: ReportPeriod) {
  return useQuery<ModelUsage[]>({
    queryKey: ['reports', 'usage-by-model', period],
    queryFn: () => getUsageByModel(period),
    staleTime: 60_000,
  });
}

export function useUsageByDay(period: ReportPeriod, granularity: Granularity = 'day') {
  return useQuery<DailyUsage[]>({
    queryKey: ['reports', 'usage-by-day', period, granularity],
    queryFn: () => getUsageByDay(period, granularity),
    staleTime: 60_000,
  });
}
