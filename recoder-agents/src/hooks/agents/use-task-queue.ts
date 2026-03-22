'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  enqueueTask,
  listTasks,
  getTask,
  cancelTask,
  retryTask,
  completeTask,
  failTask,
  getQueueStats,
  deleteCompletedTasks,
  type QueuedTask,
  type TaskQueueStats,
  type EnqueueTaskData,
  type TaskFilters,
} from '@/lib/api/task-queue';

const TASK_QUEUE_KEY = ['task-queue'] as const;
const TASK_QUEUE_STATS_KEY = ['task-queue-stats'] as const;

export function useQueuedTasks(filters?: TaskFilters) {
  return useQuery<QueuedTask[]>({
    queryKey: [
      ...TASK_QUEUE_KEY,
      filters?.status ?? 'all',
      filters?.agent_id ?? '',
      filters?.task_type ?? '',
      filters?.limit ?? 50,
      filters?.offset ?? 0,
    ],
    queryFn: () => listTasks(filters),
    staleTime: 10_000,
  });
}

export function useEnqueueTask() {
  const queryClient = useQueryClient();

  return useMutation<QueuedTask, Error, EnqueueTaskData>({
    mutationFn: (data) => enqueueTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery<QueuedTask>({
    queryKey: [...TASK_QUEUE_KEY, 'detail', taskId],
    queryFn: () => getTask(taskId!),
    enabled: !!taskId,
    staleTime: 10_000,
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation<QueuedTask, Error, string>({
    mutationFn: (taskId) => cancelTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}

export function useRetryTask() {
  const queryClient = useQueryClient();

  return useMutation<QueuedTask, Error, string>({
    mutationFn: (taskId) => retryTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation<QueuedTask, Error, { taskId: string; result?: Record<string, unknown> }>({
    mutationFn: ({ taskId, result }) => completeTask(taskId, result),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}

export function useFailTask() {
  const queryClient = useQueryClient();

  return useMutation<QueuedTask, Error, { taskId: string; errorMessage?: string }>({
    mutationFn: ({ taskId, errorMessage }) => failTask(taskId, errorMessage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}

export function useTaskQueueStats() {
  return useQuery<TaskQueueStats>({
    queryKey: [...TASK_QUEUE_STATS_KEY],
    queryFn: () => getQueueStats(),
    staleTime: 10_000,
    refetchInterval: (query) => {
      // Poll every 10s — caller can also trigger manual refetch for running tasks
      return 10_000;
    },
  });
}

export function useDeleteCompletedTasks() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted_count: number }, Error, number | undefined>({
    mutationFn: (days) => deleteCompletedTasks(days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: TASK_QUEUE_STATS_KEY });
    },
  });
}
