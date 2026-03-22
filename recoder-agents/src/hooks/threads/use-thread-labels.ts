'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  assignLabel,
  removeLabel,
  getThreadLabels,
  getLabelThreads,
  bulkAssignLabel,
  type LabelDefinition,
  type LabelAssignment,
  type CreateLabelData,
  type UpdateLabelData,
  type BulkAssignData,
} from '@/lib/api/thread-labels';

const labelsKey = ['thread-labels'] as const;
const labelThreadsKey = (labelId: string) => ['label-threads', labelId] as const;
const threadLabelsKey = (threadId: string) => ['thread-label-assignments', threadId] as const;

export function useLabels() {
  return useQuery<LabelDefinition[]>({
    queryKey: labelsKey,
    queryFn: () => listLabels(),
    staleTime: 30_000,
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();

  return useMutation<LabelDefinition, Error, CreateLabelData>({
    mutationFn: (data) => createLabel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
    },
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();

  return useMutation<LabelDefinition, Error, { id: string; data: UpdateLabelData }>({
    mutationFn: ({ id, data }) => updateLabel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (id) => deleteLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
    },
  });
}

export function useAssignLabel() {
  const queryClient = useQueryClient();

  return useMutation<LabelAssignment, Error, { threadId: string; labelId: string }>({
    mutationFn: ({ threadId, labelId }) => assignLabel(threadId, labelId),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      queryClient.invalidateQueries({ queryKey: threadLabelsKey(threadId) });
    },
  });
}

export function useRemoveLabel() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, { threadId: string; labelId: string }>({
    mutationFn: ({ threadId, labelId }) => removeLabel(threadId, labelId),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      queryClient.invalidateQueries({ queryKey: threadLabelsKey(threadId) });
    },
  });
}

export function useThreadLabels(threadId: string) {
  return useQuery<LabelAssignment[]>({
    queryKey: threadLabelsKey(threadId),
    queryFn: () => getThreadLabels(threadId),
    staleTime: 30_000,
    enabled: !!threadId,
  });
}

export function useLabelThreads(labelId: string) {
  return useQuery<{ thread_id: string; assigned_at: string }[]>({
    queryKey: labelThreadsKey(labelId),
    queryFn: () => getLabelThreads(labelId),
    staleTime: 30_000,
    enabled: !!labelId,
  });
}

export function useBulkAssignLabel() {
  const queryClient = useQueryClient();

  return useMutation<{ assigned_count: number }, Error, BulkAssignData>({
    mutationFn: (data) => bulkAssignLabel(data),
    onSuccess: (_, { label_id }) => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      queryClient.invalidateQueries({ queryKey: labelThreadsKey(label_id) });
    },
  });
}
