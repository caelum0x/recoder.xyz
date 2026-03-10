'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCustomCharts,
  createCustomChart,
  updateCustomChart,
  deleteCustomChart,
  getChartData,
  type CreateChartData,
  type UpdateChartData,
} from '@/lib/api/custom-charts';

const chartKeys = {
  all: ['custom-charts'] as const,
  lists: () => [...chartKeys.all, 'list'] as const,
  data: (chartId: string) => [...chartKeys.all, 'data', chartId] as const,
};

export function useCustomCharts() {
  return useQuery({
    queryKey: chartKeys.lists(),
    queryFn: getCustomCharts,
    staleTime: 60_000,
  });
}

export function useCreateChart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChartData) => createCustomChart(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chartKeys.lists() });
    },
  });
}

export function useUpdateChart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chartId, data }: { chartId: string; data: UpdateChartData }) =>
      updateCustomChart(chartId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}

export function useDeleteChart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chartId: string) => deleteCustomChart(chartId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chartKeys.all });
    },
  });
}

export function useChartData(chartId: string) {
  return useQuery({
    queryKey: chartKeys.data(chartId),
    queryFn: () => getChartData(chartId),
    enabled: !!chartId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}
