import { backendApi } from '@/lib/api-client';

export interface WidgetConfig {
  id: string;
  user_id: string;
  widget_type:
    | 'stats_card'
    | 'chart'
    | 'recent_threads'
    | 'active_runs'
    | 'agent_health'
    | 'cost_summary'
    | 'quick_actions'
    | 'bookmarks'
    | 'calendar'
    | 'notes';
  title: string;
  config: Record<string, any>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWidgetData {
  widget_type: string;
  title: string;
  config?: Record<string, any>;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
}

export interface UpdateWidgetData {
  title?: string;
  config?: Record<string, any>;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  is_visible?: boolean;
}

export interface LayoutItem {
  id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export const getDashboardWidgets = async (): Promise<WidgetConfig[]> => {
  const response = await backendApi.get<WidgetConfig[]>('/dashboard/widgets', {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createDashboardWidget = async (
  data: CreateWidgetData
): Promise<WidgetConfig> => {
  const response = await backendApi.post<WidgetConfig>('/dashboard/widgets', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateDashboardWidget = async (
  widgetId: string,
  data: UpdateWidgetData
): Promise<WidgetConfig> => {
  const response = await backendApi.patch<WidgetConfig>(
    `/dashboard/widgets/${widgetId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteDashboardWidget = async (widgetId: string) => {
  const response = await backendApi.delete(`/dashboard/widgets/${widgetId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const resetDashboardWidgets = async (): Promise<{
  status: string;
  widgets: WidgetConfig[];
}> => {
  const response = await backendApi.post<{ status: string; widgets: WidgetConfig[] }>(
    '/dashboard/widgets/reset'
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const batchUpdateWidgetLayout = async (
  widgets: LayoutItem[]
): Promise<{ status: string; widgets: WidgetConfig[] }> => {
  const response = await backendApi.put<{ status: string; widgets: WidgetConfig[] }>(
    '/dashboard/widgets/layout',
    { widgets }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
