'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWorkflowTemplates,
  getWorkflowTemplate,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  runWorkflowTemplate,
  getWorkflowTemplateRuns,
  type WorkflowTemplate,
  type WorkflowTemplateRun,
  type CreateWorkflowTemplateData,
  type UpdateWorkflowTemplateData,
  type WorkflowTemplateFilters,
} from '@/lib/api/workflow-templates';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const workflowTemplateKeys = {
  all: ['workflow-templates'] as const,
  lists: () => [...workflowTemplateKeys.all, 'list'] as const,
  listFiltered: (filters?: WorkflowTemplateFilters) =>
    [...workflowTemplateKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...workflowTemplateKeys.all, 'detail', id] as const,
  runs: (templateId: string) =>
    [...workflowTemplateKeys.all, 'runs', templateId] as const,
} as const;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useWorkflowTemplates(filters?: WorkflowTemplateFilters) {
  return useQuery<WorkflowTemplate[]>({
    queryKey: workflowTemplateKeys.listFiltered(filters),
    queryFn: () => getWorkflowTemplates(filters),
    staleTime: 30_000,
  });
}

export function useWorkflowTemplateDetail(templateId: string) {
  return useQuery<WorkflowTemplate>({
    queryKey: workflowTemplateKeys.detail(templateId),
    queryFn: () => getWorkflowTemplate(templateId),
    enabled: !!templateId,
    staleTime: 15_000,
  });
}

export function useWorkflowTemplateRuns(templateId: string) {
  return useQuery<WorkflowTemplateRun[]>({
    queryKey: workflowTemplateKeys.runs(templateId),
    queryFn: () => getWorkflowTemplateRuns(templateId),
    enabled: !!templateId,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowTemplateData) =>
      createWorkflowTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowTemplateKeys.lists() });
    },
  });
}

export function useUpdateWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: UpdateWorkflowTemplateData;
    }) => updateWorkflowTemplate(templateId, data),
    onSuccess: (_data, { templateId }) => {
      qc.invalidateQueries({ queryKey: workflowTemplateKeys.lists() });
      qc.invalidateQueries({
        queryKey: workflowTemplateKeys.detail(templateId),
      });
    },
  });
}

export function useDeleteWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => deleteWorkflowTemplate(templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowTemplateKeys.all });
    },
  });
}

export function useRunWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      variableValues,
    }: {
      templateId: string;
      variableValues?: Record<string, string>;
    }) => runWorkflowTemplate(templateId, variableValues),
    onSuccess: (_data, { templateId }) => {
      qc.invalidateQueries({
        queryKey: workflowTemplateKeys.runs(templateId),
      });
      qc.invalidateQueries({ queryKey: workflowTemplateKeys.lists() });
    },
  });
}
