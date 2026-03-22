'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listExportTemplates,
  createExportTemplate,
  updateExportTemplate,
  deleteExportTemplate,
  exportThread,
  getExportStats,
  type ExportTemplate,
  type CreateExportTemplateData,
  type UpdateExportTemplateData,
  type ExportTemplateStats,
  type ExportResult,
  type ExportMessage,
  type ExportFormat,
} from '@/lib/api/thread-export-templates';

const TEMPLATES_KEY = ['thread-export-templates'] as const;
const STATS_KEY = ['thread-export-stats'] as const;

export function useExportTemplates() {
  return useQuery<ExportTemplate[]>({
    queryKey: TEMPLATES_KEY,
    queryFn: () => listExportTemplates(),
    staleTime: 60_000,
  });
}

export function useExportStats() {
  return useQuery<ExportTemplateStats>({
    queryKey: STATS_KEY,
    queryFn: () => getExportStats(),
    staleTime: 60_000,
  });
}

export function useCreateExportTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ExportTemplate, Error, CreateExportTemplateData>({
    mutationFn: (data) => createExportTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      queryClient.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

export function useUpdateExportTemplate() {
  const queryClient = useQueryClient();

  return useMutation<ExportTemplate, Error, { id: string; data: UpdateExportTemplateData }>({
    mutationFn: ({ id, data }) => updateExportTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useDeleteExportTemplate() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (id) => deleteExportTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      queryClient.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

export function useExportThread() {
  const queryClient = useQueryClient();

  return useMutation<
    ExportResult,
    Error,
    { threadId: string; template_id?: string; format?: ExportFormat; messages: ExportMessage[] }
  >({
    mutationFn: ({ threadId, ...data }) => exportThread(threadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}
