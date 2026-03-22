'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  renderTemplate,
  listSends,
  getTemplateStats,
  type NotificationTemplate,
  type NotificationSend,
  type CreateTemplateData,
  type UpdateTemplateData,
  type RenderResult,
  type TemplateStats,
} from '@/lib/api/notification-templates';

// ============================================================================
// Query Keys
// ============================================================================

export const notifTemplateKeys = {
  all: ['notification-templates'] as const,
  list: (filters?: { event_type?: string; channel?: string }) =>
    [...notifTemplateKeys.all, 'list', filters ?? {}] as const,
  detail: (id: string) => [...notifTemplateKeys.all, 'detail', id] as const,
  stats: () => [...notifTemplateKeys.all, 'stats'] as const,
  sends: (options?: { limit?: number; event_type?: string }) =>
    [...notifTemplateKeys.all, 'sends', options ?? {}] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useTemplates(filters?: { event_type?: string; channel?: string }) {
  return useQuery<NotificationTemplate[]>({
    queryKey: notifTemplateKeys.list(filters),
    queryFn: () => listTemplates(filters),
    staleTime: 1000 * 60 * 2,
  });
}

export function useTemplateStats() {
  return useQuery<TemplateStats>({
    queryKey: notifTemplateKeys.stats(),
    queryFn: () => getTemplateStats(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useNotificationSends(options?: { limit?: number; event_type?: string }) {
  return useQuery<NotificationSend[]>({
    queryKey: notifTemplateKeys.sends(options),
    queryFn: () => listSends(options),
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTemplateData) => createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.all });
      toast.success('Template created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create template');
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateData }) =>
      updateTemplate(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.all });
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.detail(variables.id) });
      toast.success('Template updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update template');
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.all });
      toast.success('Template deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete template');
    },
  });
}

export function useRenderTemplate() {
  const queryClient = useQueryClient();

  return useMutation<RenderResult, Error, { id: string; variables: Record<string, string> }>({
    mutationFn: ({ id, variables }) => renderTemplate(id, variables),
    onSuccess: () => {
      // Invalidate sends list and stats (use_count changed)
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.sends() });
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.stats() });
      queryClient.invalidateQueries({ queryKey: notifTemplateKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to render template');
    },
  });
}
