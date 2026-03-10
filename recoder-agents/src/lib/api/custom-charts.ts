import { backendApi } from '@/lib/api-client';

export interface CustomChart {
  id: string;
  user_id: string;
  title: string;
  chart_type: 'line' | 'bar' | 'area' | 'pie' | 'number';
  data_source: 'agent_runs' | 'costs' | 'tokens' | 'errors' | 'api_usage' | 'thread_count';
  agent_id: string | null;
  time_range: '7d' | '14d' | '30d' | '90d';
  display_order: number;
  is_visible: boolean;
  created_at: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface ChartDataResponse {
  chart_id: string;
  title: string;
  chart_type: string;
  data_source: string;
  time_range: string;
  data_points: ChartDataPoint[];
  total: number;
}

export interface CreateChartData {
  title: string;
  chart_type: string;
  data_source: string;
  agent_id?: string | null;
  time_range?: string;
}

export interface UpdateChartData {
  title?: string;
  chart_type?: string;
  data_source?: string;
  agent_id?: string | null;
  time_range?: string;
  display_order?: number;
  is_visible?: boolean;
}

export const getCustomCharts = async (): Promise<CustomChart[]> => {
  const response = await backendApi.get<CustomChart[]>('/dashboard/charts', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createCustomChart = async (data: CreateChartData): Promise<CustomChart> => {
  const response = await backendApi.post<CustomChart>('/dashboard/charts', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateCustomChart = async (
  chartId: string,
  data: UpdateChartData
): Promise<CustomChart> => {
  const response = await backendApi.patch<CustomChart>(`/dashboard/charts/${chartId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCustomChart = async (chartId: string) => {
  const response = await backendApi.delete(`/dashboard/charts/${chartId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getChartData = async (chartId: string): Promise<ChartDataResponse> => {
  const response = await backendApi.get<ChartDataResponse>(
    `/dashboard/charts/${chartId}/data`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
