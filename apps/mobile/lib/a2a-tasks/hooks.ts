/**
 * A2A Task React Query Hooks
 *
 * Follows the same query key / hook patterns as lib/agents/hooks.ts
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { log } from '@/lib/logger';
import { fetchDelegatedTasks, fetchDelegatedTask, fetchTaskApproval } from './api';
import type {
  DelegatedTask,
  TaskListResponse,
  TaskDetailResponse,
  TaskApproval,
  TaskListParams,
  MobileTaskEvent,
  MobileTaskEventPayload,
} from './types';

// ============================================================================
// Query Keys
// ============================================================================

export const a2aTaskKeys = {
  all: ['a2a-tasks'] as const,
  lists: () => [...a2aTaskKeys.all, 'list'] as const,
  list: (params: TaskListParams) => [...a2aTaskKeys.lists(), params] as const,
  details: () => [...a2aTaskKeys.all, 'detail'] as const,
  detail: (id: string) => [...a2aTaskKeys.details(), id] as const,
  approvals: () => [...a2aTaskKeys.all, 'approval'] as const,
  approval: (id: string) => [...a2aTaskKeys.approvals(), id] as const,
};

// ============================================================================
// Task List Hook
// ============================================================================

export function useDelegatedTasks(
  params: TaskListParams = {},
  options?: Omit<UseQueryOptions<TaskListResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: a2aTaskKeys.list(params),
    queryFn: () => fetchDelegatedTasks(params),
    staleTime: 30 * 1000, // 30 seconds - tasks change more often
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000, // Auto-refresh every 30s
    retry: (failureCount, error) => {
      const is4xx =
        error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('429');
      if (is4xx) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    ...options,
  });
}

// ============================================================================
// Task Detail Hook
// ============================================================================

export function useDelegatedTask(
  taskId: string | undefined,
  options?: Omit<UseQueryOptions<TaskDetailResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: a2aTaskKeys.detail(taskId || ''),
    queryFn: () => fetchDelegatedTask(taskId!),
    enabled: !!taskId,
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000, // Faster refresh for detail view
    retry: 2,
    ...options,
  });
}

// ============================================================================
// Task Approval Hook
// ============================================================================

export function useTaskApproval(
  taskId: string | undefined,
  options?: Omit<UseQueryOptions<TaskApproval | null, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: a2aTaskKeys.approval(taskId || ''),
    queryFn: () => fetchTaskApproval(taskId!),
    enabled: !!taskId,
    staleTime: 15 * 1000,
    ...options,
  });
}

// ============================================================================
// Activation Event Hook
// ============================================================================

/**
 * Emits mobile activation events for task interactions.
 * Logs events locally; integrates with TrackingContext if available.
 */
export function useTaskActivationEvents() {
  const emittedRef = useRef<Set<string>>(new Set());

  const emit = useCallback((event: MobileTaskEvent, taskId?: string) => {
    // De-duplicate rapid-fire identical events within a session
    const key = `${event}:${taskId ?? ''}`;
    if (emittedRef.current.has(key)) return;
    emittedRef.current.add(key);

    // Clear de-dup after 5 seconds to allow re-emission
    setTimeout(() => {
      emittedRef.current.delete(key);
    }, 5000);

    const payload: MobileTaskEventPayload = {
      event,
      taskId,
      timestamp: new Date().toISOString(),
    };

    log.log('[A2A:event]', payload.event, payload.taskId ?? '(list)');

    // In a production integration you would forward this to your
    // analytics pipeline (PostHog, Mixpanel, etc.) here.
    // For now the structured log is queryable via the KTX logger.
  }, []);

  const emitTaskListOpened = useCallback(() => {
    emit('mobile_task_list_opened');
  }, [emit]);

  const emitTaskViewed = useCallback((taskId: string) => {
    emit('mobile_task_viewed', taskId);
  }, [emit]);

  return { emitTaskListOpened, emitTaskViewed };
}
