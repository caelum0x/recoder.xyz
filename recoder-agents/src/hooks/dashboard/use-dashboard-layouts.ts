'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardLayouts,
  getLayoutDetail,
  createDashboardLayout,
  updateDashboardLayout,
  deleteDashboardLayout,
  setLayoutWidgets,
  getLayoutTemplates,
  type CreateLayoutData,
  type UpdateLayoutData,
  type WidgetInput,
} from '@/lib/api/dashboard-layouts';

const layoutKeys = {
  all: ['dashboard-layouts'] as const,
  list: () => [...layoutKeys.all, 'list'] as const,
  detail: (id: string) => [...layoutKeys.all, 'detail', id] as const,
  templates: () => [...layoutKeys.all, 'templates'] as const,
};

export function useDashboardLayouts() {
  return useQuery({
    queryKey: layoutKeys.list(),
    queryFn: getDashboardLayouts,
    staleTime: 60_000,
  });
}

export function useLayoutDetail(layoutId: string | null) {
  return useQuery({
    queryKey: layoutKeys.detail(layoutId ?? ''),
    queryFn: () => getLayoutDetail(layoutId!),
    enabled: !!layoutId,
    staleTime: 30_000,
  });
}

export function useCreateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLayoutData) => createDashboardLayout(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layoutKeys.list() });
    },
  });
}

export function useUpdateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layoutId, data }: { layoutId: string; data: UpdateLayoutData }) =>
      updateDashboardLayout(layoutId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layoutKeys.all });
    },
  });
}

export function useDeleteLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layoutId: string) => deleteDashboardLayout(layoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layoutKeys.all });
    },
  });
}

export function useSetLayoutWidgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ layoutId, widgets }: { layoutId: string; widgets: WidgetInput[] }) =>
      setLayoutWidgets(layoutId, widgets),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: layoutKeys.all });
    },
  });
}

export function useLayoutTemplates() {
  return useQuery({
    queryKey: layoutKeys.templates(),
    queryFn: getLayoutTemplates,
    staleTime: 300_000,
  });
}
