'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { dockerBackendApi, connectDockerSSE, type DockerSSEConnection } from '@/lib/docker-backend-api';
import type { DispatchRecord, MultiDispatchRequest } from '@recoder/shared/a2a';

const dispatchKeys = {
  all: ['dispatches'] as const,
  detail: (id: string) => [...dispatchKeys.all, 'detail', id] as const,
  results: (id: string) => [...dispatchKeys.all, 'results', id] as const,
};

export function useMultiDispatch() {
  return useMutation({
    mutationFn: async ({ wsId, ...request }: MultiDispatchRequest & { wsId: string }) => {
      const res = await dockerBackendApi.post<DispatchRecord>(
        `/api/a2a/workspaces/${wsId}/dispatch`,
        request,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to dispatch');
    },
  });
}

export function useDispatchStatus(dispatchId: string | null, wsId: string | null) {
  return useQuery({
    queryKey: dispatchKeys.detail(dispatchId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<DispatchRecord>(
        `/api/a2a/workspaces/${wsId}/dispatch/${dispatchId}`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to get dispatch');
    },
    enabled: !!dispatchId && !!wsId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'completed' || data?.status === 'failed' || data?.status === 'cancelled') {
        return false;
      }
      return 3000;
    },
  });
}

export function useCancelDispatch() {
  return useMutation({
    mutationFn: async ({ wsId, dispatchId }: { wsId: string; dispatchId: string }) => {
      const res = await dockerBackendApi.post(`/api/a2a/workspaces/${wsId}/dispatch/${dispatchId}/cancel`);
      if (res.success) return true;
      throw new Error(res.error?.message || 'Failed to cancel');
    },
  });
}

/**
 * Subscribe to multi-dispatch progress via SSE on each task.
 */
export function useDispatchTracker(
  dispatchRecord: DispatchRecord | null,
  callbacks?: {
    onTaskProgress?: (taskId: string, data: Record<string, unknown>) => void;
    onTaskCompleted?: (taskId: string, data: Record<string, unknown>) => void;
    onTaskFailed?: (taskId: string, data: Record<string, unknown>) => void;
  },
) {
  const connectionsRef = useRef<DockerSSEConnection[]>([]);

  useEffect(() => {
    // Cleanup previous
    connectionsRef.current.forEach((c) => c.close());
    connectionsRef.current = [];

    if (!dispatchRecord?.taskIds?.length) return;

    for (const taskId of dispatchRecord.taskIds) {
      const connection = connectDockerSSE(
        `/api/a2a/tasks/${taskId}/stream`,
        {
          'task.progress': (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);
              callbacks?.onTaskProgress?.(taskId, data.data ?? data);
            } catch { /* ignore */ }
          },
          'task.completed': (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);
              callbacks?.onTaskCompleted?.(taskId, data.data ?? data);
            } catch { /* ignore */ }
          },
          'task.failed': (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);
              callbacks?.onTaskFailed?.(taskId, data.data ?? data);
            } catch { /* ignore */ }
          },
        },
      );
      connectionsRef.current.push(connection);
    }

    return () => {
      connectionsRef.current.forEach((c) => c.close());
      connectionsRef.current = [];
    };
  }, [dispatchRecord?.dispatchId]);
}
