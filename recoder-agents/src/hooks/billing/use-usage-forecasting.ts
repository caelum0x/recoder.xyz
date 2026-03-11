'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateForecast,
  listForecasts,
  getForecastDetail,
  recordSnapshot,
  listSnapshots,
  getUsageTrends,
  type UsageForecast,
  type GenerateForecastPayload,
  type GenerateForecastResponse,
  type UsageSnapshot,
  type RecordSnapshotPayload,
  type UsageTrendsResponse,
  type ForecastFilters,
  type SnapshotFilters,
} from '@/lib/api/usage-forecasting';

const FORECASTS_KEY = ['usage-forecasts'] as const;
const SNAPSHOTS_KEY = ['usage-snapshots'] as const;
const TRENDS_KEY = ['usage-trends'] as const;

export function useGenerateForecast() {
  const queryClient = useQueryClient();

  return useMutation<GenerateForecastResponse, Error, GenerateForecastPayload>({
    mutationFn: (payload) => generateForecast(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FORECASTS_KEY });
      queryClient.invalidateQueries({ queryKey: TRENDS_KEY });
    },
  });
}

export function useForecasts(filters?: ForecastFilters) {
  return useQuery<UsageForecast[]>({
    queryKey: [...FORECASTS_KEY, filters?.metric_type ?? 'all', filters?.forecast_period ?? 'all'],
    queryFn: () => listForecasts(filters),
    staleTime: 60_000,
  });
}

export function useForecastDetail(metricType: string, forecastPeriod: string = 'monthly') {
  return useQuery<UsageForecast>({
    queryKey: [...FORECASTS_KEY, 'detail', metricType, forecastPeriod],
    queryFn: () => getForecastDetail(metricType, forecastPeriod),
    staleTime: 60_000,
    enabled: !!metricType,
  });
}

export function useRecordSnapshot() {
  const queryClient = useQueryClient();

  return useMutation<UsageSnapshot, Error, RecordSnapshotPayload>({
    mutationFn: (payload) => recordSnapshot(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SNAPSHOTS_KEY });
      queryClient.invalidateQueries({ queryKey: TRENDS_KEY });
    },
  });
}

export function useUsageSnapshots(filters?: SnapshotFilters) {
  return useQuery<UsageSnapshot[]>({
    queryKey: [...SNAPSHOTS_KEY, filters?.metric_type ?? 'all'],
    queryFn: () => listSnapshots(filters),
    staleTime: 30_000,
  });
}

export function useUsageTrends() {
  return useQuery<UsageTrendsResponse>({
    queryKey: [...TRENDS_KEY],
    queryFn: () => getUsageTrends(),
    staleTime: 60_000,
  });
}
