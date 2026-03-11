import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  setDefaultFilter,
} from '@/lib/api/saved-filters';

export function useSavedFilters(viewType?: string) {
  return useQuery({
    queryKey: ['saved-filters', viewType],
    queryFn: () => getFilters(viewType),
    staleTime: 30_000,
  });
}

export function useCreateFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createFilter,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters', data.view_type] });
      queryClient.invalidateQueries({ queryKey: ['saved-filters', undefined] });
    },
  });
}

export function useUpdateFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      filters?: Record<string, any>;
      is_default?: boolean;
    }) => updateFilter(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    },
  });
}

export function useDeleteFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteFilter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    },
  });
}

export function useSetDefaultFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => setDefaultFilter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
    },
  });
}
