import { useQuery } from '@tanstack/react-query';
import {
  getApiUsageHeatmap,
  getApiEndpoints,
  getApiPeakHours,
} from '@/lib/api/api-usage-heatmap';

export function useApiUsageHeatmap(days: number = 7, endpointGroup?: string) {
  return useQuery({
    queryKey: ['api-usage-heatmap', days, endpointGroup],
    queryFn: () => getApiUsageHeatmap(days, endpointGroup),
    staleTime: 60_000, // 1 minute
  });
}

export function useApiEndpoints() {
  return useQuery({
    queryKey: ['api-usage-endpoints'],
    queryFn: getApiEndpoints,
    staleTime: 5 * 60_000, // 5 minutes
  });
}

export function useApiPeakHours(days: number = 7) {
  return useQuery({
    queryKey: ['api-usage-peak-hours', days],
    queryFn: () => getApiPeakHours(days),
    staleTime: 60_000,
  });
}
