import { backendApi } from '@/lib/api-client';

export interface HeatmapCell {
  day_of_week: number;
  hour: number;
  request_count: number;
  error_count: number;
  avg_latency_ms: number;
}

export interface EndpointGroup {
  endpoint_group: string;
  total_requests: number;
}

export interface PeakHour {
  day_of_week: number;
  hour: number;
  avg_request_count: number;
}

export interface RecordUsageData {
  endpoint_group: string;
  request_count?: number;
  error_count?: number;
  avg_latency_ms?: number;
}

export const getApiUsageHeatmap = async (
  days: number = 7,
  endpointGroup?: string
): Promise<HeatmapCell[]> => {
  let url = `/api-usage/heatmap?days=${days}`;
  if (endpointGroup && endpointGroup !== 'all') {
    url += `&endpoint_group=${encodeURIComponent(endpointGroup)}`;
  }
  const response = await backendApi.get<HeatmapCell[]>(url, {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getApiEndpoints = async (): Promise<EndpointGroup[]> => {
  const response = await backendApi.get<EndpointGroup[]>(
    '/api-usage/endpoints',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const recordApiUsage = async (data: RecordUsageData): Promise<void> => {
  const response = await backendApi.post('/api-usage/record', data);
  if (response.error) throw new Error(response.error.message);
};

export const getApiPeakHours = async (
  days: number = 7
): Promise<PeakHour[]> => {
  const response = await backendApi.get<PeakHour[]>(
    `/api-usage/peak-hours?days=${days}`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
