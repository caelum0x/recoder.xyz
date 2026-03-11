import { backendApi } from '@/lib/api-client';

export interface SavedFilter {
  id: string;
  user_id: string;
  name: string;
  view_type: string;
  filters: Record<string, any>;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export const createFilter = async (data: {
  name: string;
  view_type: string;
  filters: Record<string, any>;
  is_default?: boolean;
}): Promise<SavedFilter> => {
  const response = await backendApi.post<SavedFilter>('/filters', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getFilters = async (
  viewType?: string,
): Promise<SavedFilter[]> => {
  const params = new URLSearchParams();
  if (viewType) params.set('view_type', viewType);
  const query = params.toString() ? `?${params}` : '';
  const response = await backendApi.get<SavedFilter[]>(`/filters${query}`, {
    showErrors: false,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateFilter = async (
  id: string,
  data: Partial<Pick<SavedFilter, 'name' | 'filters' | 'is_default'>>,
): Promise<SavedFilter> => {
  const response = await backendApi.patch<SavedFilter>(`/filters/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteFilter = async (id: string) => {
  const response = await backendApi.delete(`/filters/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const setDefaultFilter = async (id: string): Promise<SavedFilter> => {
  const response = await backendApi.put<SavedFilter>(`/filters/${id}/default`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
