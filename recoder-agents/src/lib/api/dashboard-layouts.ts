import { backendApi } from '@/lib/api-client';

export interface LayoutWidget {
  id: string;
  layout_id: string;
  widget_type:
    | 'agent_status'
    | 'recent_threads'
    | 'activity_feed'
    | 'health_status'
    | 'quick_actions'
    | 'favorites'
    | 'stats_card'
    | 'chart'
    | 'checklist'
    | 'bookmarks';
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config: Record<string, any>;
  created_at: string;
}

export interface DashboardLayout {
  id: string;
  user_id: string;
  name: string;
  layout: any[];
  is_active: boolean;
  is_template: boolean;
  widget_count?: number;
  widgets?: LayoutWidget[];
  created_at: string;
  updated_at: string;
}

export interface WidgetInput {
  widget_type: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config?: Record<string, any>;
}

export interface CreateLayoutData {
  name: string;
  widgets?: WidgetInput[];
}

export interface UpdateLayoutData {
  name?: string;
  is_active?: boolean;
}

export const getDashboardLayouts = async (): Promise<DashboardLayout[]> => {
  const response = await backendApi.get<DashboardLayout[]>('/dashboard/layouts', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLayoutDetail = async (layoutId: string): Promise<DashboardLayout> => {
  const response = await backendApi.get<DashboardLayout>(
    `/dashboard/layouts/${layoutId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createDashboardLayout = async (
  data: CreateLayoutData
): Promise<DashboardLayout> => {
  const response = await backendApi.post<DashboardLayout>('/dashboard/layouts', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateDashboardLayout = async (
  layoutId: string,
  data: UpdateLayoutData
): Promise<DashboardLayout> => {
  const response = await backendApi.patch<DashboardLayout>(
    `/dashboard/layouts/${layoutId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteDashboardLayout = async (layoutId: string) => {
  const response = await backendApi.delete(`/dashboard/layouts/${layoutId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const setLayoutWidgets = async (
  layoutId: string,
  widgets: WidgetInput[]
): Promise<{ status: string; widgets: LayoutWidget[] }> => {
  const response = await backendApi.put<{ status: string; widgets: LayoutWidget[] }>(
    `/dashboard/layouts/${layoutId}/widgets`,
    { widgets }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getLayoutTemplates = async (): Promise<DashboardLayout[]> => {
  const response = await backendApi.get<DashboardLayout[]>(
    '/dashboard/layouts/templates',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
