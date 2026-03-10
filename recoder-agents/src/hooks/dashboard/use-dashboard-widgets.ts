'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardWidgets,
  createDashboardWidget,
  updateDashboardWidget,
  deleteDashboardWidget,
  resetDashboardWidgets,
  batchUpdateWidgetLayout,
  type CreateWidgetData,
  type UpdateWidgetData,
  type LayoutItem,
} from '@/lib/api/dashboard-widgets';

const widgetKeys = {
  all: ['dashboard-widgets'] as const,
  list: () => [...widgetKeys.all, 'list'] as const,
};

export function useDashboardWidgets() {
  return useQuery({
    queryKey: widgetKeys.list(),
    queryFn: getDashboardWidgets,
    staleTime: 60_000,
  });
}

export function useCreateWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWidgetData) => createDashboardWidget(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetKeys.list() });
    },
  });
}

export function useUpdateWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      widgetId,
      data,
    }: {
      widgetId: string;
      data: UpdateWidgetData;
    }) => updateDashboardWidget(widgetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetKeys.all });
    },
  });
}

export function useDeleteWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (widgetId: string) => deleteDashboardWidget(widgetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetKeys.all });
    },
  });
}

export function useResetWidgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetDashboardWidgets(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetKeys.all });
    },
  });
}

export function useBatchUpdateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (widgets: LayoutItem[]) => batchUpdateWidgetLayout(widgets),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetKeys.all });
    },
  });
}
