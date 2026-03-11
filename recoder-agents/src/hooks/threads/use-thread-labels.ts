'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createThreadLabel,
  getThreadLabels,
  updateThreadLabel,
  deleteThreadLabel,
  assignLabel,
  removeLabel,
  getThreadLabelsList,
  getLabelThreads,
  type CreateLabelData,
  type UpdateLabelData,
} from '@/lib/api/thread-labels';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const labelKeys = {
  all: ['thread-labels'] as const,
  lists: () => [...labelKeys.all, 'list'] as const,
  thread: (threadId: string) =>
    [...labelKeys.all, 'thread', threadId] as const,
  labelThreads: (labelId: string) =>
    [...labelKeys.all, 'label-threads', labelId] as const,
};

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useThreadLabels() {
  return useQuery({
    queryKey: labelKeys.lists(),
    queryFn: getThreadLabels,
    staleTime: 60_000,
  });
}

export function useThreadLabelsList(threadId: string) {
  return useQuery({
    queryKey: labelKeys.thread(threadId),
    queryFn: () => getThreadLabelsList(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useLabelThreads(labelId: string) {
  return useQuery({
    queryKey: labelKeys.labelThreads(labelId),
    queryFn: () => getLabelThreads(labelId),
    enabled: !!labelId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateThreadLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLabelData) => createThreadLabel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}

export function useUpdateThreadLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      labelId,
      data,
    }: {
      labelId: string;
      data: UpdateLabelData;
    }) => updateThreadLabel(labelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}

export function useDeleteThreadLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => deleteThreadLabel(labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}

export function useAssignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      labelId,
    }: {
      threadId: string;
      labelId: string;
    }) => assignLabel(threadId, labelId),
    onSuccess: (_data, { threadId }) => {
      qc.invalidateQueries({ queryKey: labelKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}

export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      labelId,
    }: {
      threadId: string;
      labelId: string;
    }) => removeLabel(threadId, labelId),
    onSuccess: (_data, { threadId }) => {
      qc.invalidateQueries({ queryKey: labelKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
}
